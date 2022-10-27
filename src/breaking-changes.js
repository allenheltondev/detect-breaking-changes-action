const core = require('@actions/core');

const types = [
  {
    name: 'removed-paths',
    description: 'An entire endpoint and all associated http methods was removed.',
    message: '%VALUE% was removed'
  },
  {
    name: 'removed-http-methods',
    description: 'An individual http method was removed from a path.',
    message: '%VALUE% was removed'
  },
  {
    name: 'required-request-body',
    description: 'A request now requires a body to be provided.',
    message: '%VALUE% now requires a request body'
  },
  {
    name: 'new-schema-definition',
    description: 'A new schema was created for an existing property or object.',
    message: '%VALUE% has a new definition that did not exist before'
  },
  {
    name: 'schema-type-changed',
    description: 'A data type was changed for a top-level schema. Example: "object" to "array".',
    message: '%VALUE% data type changed in the schema'
  },
  {
    name: 'schema-new-required-properties',
    description: 'An existing schema has new required properties.'
  },
  {
    name: 'schema-property-type-changed',
    description: 'The data type of a property in a schema changed. Example: "string" to "number".'
  },
  {
    name: 'schema-properties-removed',
    description: 'All properties have been removed from a schema.',
    message: '%VALUE% no longer has properties defined'
  },
  {
    name: 'multiple-of-type-changed',
    description: 'A schema defined with a multiple-of property (allOf, anyOf, oneOf) changed. Example: "allOf" to "anyOf".'
  },
  {
    name: 'fewer-multiple-of-options',
    description: 'A schema defined with a multiple-of property (allOf, anyOf, oneOf) has fewer options than before.',
  },
  {
    name: 'response-removed',
    description: 'A path no longer returns a response code it did previously.'
  },
  {
    name: 'new-required-parameters',
    description: 'A path requires additional parameters to be provided.'
  },
  {
    name: 'parameters-removed',
    description: 'A path no longer supports one or more parameters'
  },
  {
    name: 'parameter-type-changed',
    description: 'The data type of one or more parameters changed. Example: "string" to "number".'
  }
];

class BreakingChanges {
  constructor(configuredTypes) {
    if (configuredTypes?.length) {
      this.breakingChangeTypes = [];
      for (const configuredType of configuredTypes) {
        const type = types.find(t => t.name == configuredType);
        if (type) {
          this.breakingChangeTypes.push(type);
        } else {
          core.warning(`Provided breaking change type "${configuredType}" is not valid.`);
        }
      }
    } else {
      this.breakingChangeTypes = types;
    }
    this.breakingChanges = [];
  }

  detect(type, message) {
    const breakingChange = this.breakingChangeTypes.find(ct => ct.name == type);
    if (breakingChange?.message) {
      this.breakingChanges.push({
        type,
        message: breakingChange.message.replace('%VALUE%', message)
      });
    } else if (breakingChange) {
      this.breakingChanges.push({ type, message });
    }
  }
}

exports.BreakingChanges = BreakingChanges;