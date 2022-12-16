
const _ = require('lodash');
const core = require('@actions/core');
const { BreakingChanges } = require('./breaking-changes');
var detector;

exports.detectBreakingChanges = (previousSpec, newSpec, configuredTypes) => {
  detector = new BreakingChanges(configuredTypes);
  core.info(`Detecting the following breaking change types:\r\n ${detector.breakingChangeTypes.map(bct => bct.name).join('\r\n ')}`);
  validatePaths(previousSpec, newSpec);
  validateSchemas(previousSpec, newSpec);

  return detector.breakingChanges;
};

function validatePaths(existingSpec, newSpec) {
  for (const [existingPathName, existingPathDetails] of Object.entries(existingSpec.paths)) {
    const newPath = newSpec.paths[existingPathName];
    if (!newPath) {
      detector.detect('removed-paths', existingPathName);
    }
    else {
      validateParameters(existingPathName, existingSpec, existingPathDetails.parameters, newSpec, newPath.parameters);
      for (const existingPathHttpMethod of Object.keys(existingPathDetails)) {
        if (existingPathHttpMethod.toLowerCase() === 'parameters') {
          continue;
        }
        const fullPathName = `${existingPathHttpMethod.toUpperCase()} ${existingPathName}`;
        const newPathHttpMethod = newPath[existingPathHttpMethod];
        if (!newPathHttpMethod) {
          detector.detect('removed-http-methods', fullPathName);
        }

        validateResponses(fullPathName, existingSpec, existingPathDetails[existingPathHttpMethod].responses, newSpec, newPathHttpMethod.responses);
        validateParameters(fullPathName, existingSpec, existingPathDetails[existingPathHttpMethod].parameters, newSpec, newPathHttpMethod.parameters);
      }
    }
  }
}

function validateSchemas(existingSpec, newSpec) {
  for (const [existingPathName, existingPathDetails] of Object.entries(existingSpec.paths)) {
    const newPath = newSpec.paths[existingPathName];
    if (!newPath) {
      continue;
    }

    for (const [existingPathHttpMethod, existingPathHttpMethodDetails] of Object.entries(existingPathDetails)) {
      if (existingPathHttpMethod.toLowerCase() === 'parameters' || !newPath[existingPathHttpMethod]) {
        continue;
      }

      const fullPathName = `${existingPathHttpMethod.toUpperCase()} ${existingPathName}`;
      const newPathHttpMethod = newPath[existingPathHttpMethod];
      if (newPathHttpMethod.requestBody && newPathHttpMethod.requestBody.required) {
        if (!existingPathHttpMethodDetails?.requestBody?.required) {
          detector.detect('required-request-body', fullPathName);
        }
      }

      const newRequestBody = getRequestBodyForHttpMethod(newSpec, newPathHttpMethod);
      const existingRequestBody = getRequestBodyForHttpMethod(existingSpec, existingPathHttpMethodDetails);
      compareSchemas(fullPathName, existingSpec, existingRequestBody, newSpec, newRequestBody);
    }
  }
}

function getSchemaReference(schema, referenceName) {
  const refPieces = referenceName.split('/');
  let reference = schema;
  for (let i = 1; i < refPieces.length; i++) {
    reference = reference[refPieces[i]];
  }

  return reference;
}

function getRequestBodyForHttpMethod(schema, schemaMethod) {
  let currentSchemaBody;
  if (!schemaMethod.requestBody || !schemaMethod.requestBody.content || !schemaMethod.requestBody.content['application/json']
    || !schemaMethod.requestBody.content['application/json'].schema) {
    return currentSchemaBody;
  }

  if (schemaMethod.requestBody.content['application/json'].schema.$ref) {
    currentSchemaBody = getSchemaReference(schema, schemaMethod.requestBody.content['application/json'].schema.$ref);
  }
  else {
    currentSchemaBody = schemaMethod.requestBody.content['application/json'].schema;
  }
  return currentSchemaBody;
}

function compareSchemas(description, existingSchema, existingSchemaRef, newSchema, newSchemaRef) {
  if (!existingSchemaRef) {
    if (newSchemaRef) {
      detector.detect('new-schema-definition', description);
    }
    return;
  }

  if (!newSchemaRef) {
    return;
  }

  if (existingSchemaRef.$ref) {
    existingSchemaRef = getSchemaReference(existingSchema, existingSchemaRef.$ref);
  }
  if (newSchemaRef.$ref) {
    newSchemaRef = getSchemaReference(newSchema, newSchemaRef.$ref);
  }

  if (existingSchemaRef && existingSchemaRef.type && existingSchemaRef.type === 'object') {
    if (!newSchemaRef || !newSchemaRef.type || newSchemaRef.type !== 'object') {
      detector.detect('schema-type-changed', description);
      return;
    }

    if (newSchemaRef.required) {
      if (existingSchemaRef.required) {
        const newRequiredFields = [];
        for (const requiredField of newSchemaRef.required) {
          const field = existingSchemaRef.required.find(r => r.toLowerCase() === requiredField.toLowerCase());
          if (!field) {
            newRequiredFields.push(requiredField);
          }
        }

        if (newRequiredFields.length) {
          detector.detect('schema-new-required-properties', `${description} has ${newRequiredFields.length} new required fields: ${newRequiredFields.join(', ')}`);
        }
      }
      else {
        detector.detect('schema-new-required-properties', `${description} has ${newSchemaRef.required.length} new required fields: ${newSchemaRef.required.join(',')}`);
      }
    }

    if (existingSchemaRef.properties) {
      if (newSchemaRef.properties) {
        let hasAllProperties = true;
        const mutatedProperties = [];
        for (const [propertyName, property] of Object.entries(existingSchemaRef.properties)) {
          const currentSchemaProperty = newSchemaRef.properties[propertyName];
          if (!currentSchemaProperty) {
            hasAllProperties = false;
            break;
          }

          if (property.$ref) {
            const previousChild = getSchemaReference(existingSchema, property.$ref);
            let currentChild = currentSchemaProperty;
            if (currentChild.$ref) {
              currentChild = getSchemaReference(newSchema, currentChild.$ref);
            }
            compareSchemas(description, existingSchema, previousChild, newSchema, currentChild);
          }
          else if (property.type && ['string', 'number', 'integer', 'boolean'].includes(property.type)) {
            if (property.type !== currentSchemaProperty.type) {
              mutatedProperties.push(propertyName);
            }
          }
          else {
            compareSchemas(description, existingSchema, property, newSchema, currentSchemaProperty);
          }
        }
        if (!hasAllProperties) {
          detector.detect('schema-removed-properties', description);
        }

        if (mutatedProperties.length) {
          detector.detect('schema-property-type-changed', `${description} has ${mutatedProperties.length} properties that have changed data type: ${mutatedProperties.join(', ')}`);
        }
      }
      else {
        detector.detect('schema-properties-removed', description);
      }
    }
  }
  else if (existingSchemaRef && existingSchemaRef.oneOf) {
    validateMultiOptionSchema(description, existingSchema, existingSchemaRef, newSchema, newSchemaRef, 'oneOf');
  }
  else if (existingSchemaRef && existingSchemaRef.allOf) {
    validateMultiOptionSchema(description, existingSchema, existingSchemaRef, newSchema, newSchemaRef, 'allOf');
  }
  else if (existingSchemaRef && existingSchemaRef.anyOf) {
    validateMultiOptionSchema(description, existingSchema, existingSchemaRef, newSchema, newSchemaRef, 'anyOf');
  }
  else if (existingSchemaRef && existingSchemaRef.type && existingSchemaRef.type === 'array') {
    if (!newSchemaRef || !newSchemaRef.type || newSchemaRef.type !== 'array') {
      detector.detect('schema-type-changed', description);
    }
    else {
      compareSchemas(`${description} - array`, existingSchema, existingSchemaRef.items, newSchema, newSchemaRef.items);
    }
  }
  else {
    if (!_.isEqual(existingSchemaRef, newSchemaRef)) {
      detector.detect('schema-property-type-changed', description);
    }
  }
}

function validateMultiOptionSchema(description, existingSchema, existingSchemaRef, newSchema, newSchemaRef, multiOptionType) {
  if (!newSchemaRef[multiOptionType]) {
    detector.detect('multiple-of-type-changed', `${description} schema does not have the same "multiple of" type (was "${multiOptionType}")`);
  }
  else if (existingSchemaRef[multiOptionType].length > newSchemaRef[multiOptionType].length) {
    detector.detect('fewer-multiple-of-options', `${description} schema has more '${multiOptionType}' options`);
  } else {
    for (let i = 0; i < existingSchemaRef[multiOptionType].length; i++) {
      let existingMultiOptionType = existingSchemaRef[multiOptionType][i];
      const newMultiOptionType = newSchemaRef[multiOptionType][i];
      compareSchemas(description, existingSchema, existingMultiOptionType, newSchema, newMultiOptionType);
    }
  }
}

function validateResponses(description, previousSchema, previousResponses, newSchema, newResponses) {
  for (const [responseKey, responseDetails] of Object.entries(previousResponses)) {
    const newResponse = newResponses[responseKey];
    if (!newResponse) {
      detector.detect('response-removed', `${description} is no longer allowed to return a '${responseKey}' response`);
      continue;
    }

    compareSchemas(`${description} - ${responseKey}`, previousSchema, responseDetails, newSchema, newResponse);
  }
}

function validateParameters(description, previousSchema, previousParameters, currentSchema, currentParameters) {
  if ((!previousParameters || !previousParameters.length) && (!currentParameters || !currentParameters.length)) {
    return;
  }

  const newRequiredParams = [];
  const breakingParams = [];
  for(const param of currentParameters) {
    let paramDetails = param;
    let previousParam;
    if (param.$ref) {
      paramDetails = getSchemaReference(currentSchema, param.$ref);
      previousParam = previousParameters.find(pp => pp.$ref && pp.$ref == param.$ref);
      if (previousParam) {
        previousParam = getSchemaReference(previousSchema, previousParam.$ref);
      }
    }

    if (!previousParam) {
      previousParam = previousParameters.find(pp => pp.name == paramDetails.name);
    }

    if (paramDetails.required && (!previousParam || !previousParam.required)) {
      newRequiredParams.push(paramDetails.name);
    }
    else if (previousParam) {
      const isFunctionallyTheSame = paramDetails.in == previousParam.in && _.isEqual(paramDetails.schema, previousParam.schema);

      if (!isFunctionallyTheSame) {
        breakingParams.push(paramDetails.name);
      }
    }
  };

  if (newRequiredParams.length) {
    detector.detect('new-required-parameters', `${description} has ${newRequiredParams.length} new required parameters: ${newRequiredParams.join(', ')}`);
  }

  const missingParams = [];
  for(const param of previousParameters) {
    let paramDetails = param;
    let currentParam;
    if (param.$ref) {
      paramDetails = getSchemaReference(previousSchema, param.$ref);
      currentParam = currentParameters.find(cp => cp.$ref && cp.$ref == param.$ref);
      if (currentParam) {
        currentParam = getSchemaReference(currentSchema, currentParam.$ref);
      }
    }

    if (!currentParam) {
      currentParam = currentParameters.find(cp => cp.name == paramDetails.name);
    }

    if (!currentParam) {
      missingParams.push(paramDetails.name);
    }
  };

  if (missingParams.length) {
    detector.detect('missing-required-parameters', `${description} is missing ${missingParams.length} required parameters: ${missingParams.join(', ')}`);
  }

  if (breakingParams.length) {
    detector.detect('parameter-type-changed', `${description} has ${breakingParams.length} parameters with breaking changes: ${breakingParams.join(', ')}`);
  }
}