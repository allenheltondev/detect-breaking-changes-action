const github = require('@actions/github');
const { Octokit } = require('octokit');
const fs = require('fs');
const yaml = require('js-yaml');

exports.loadSpecFromMainBranch = async (authToken, fileName, format) => {
  try {
    const octokit = new Octokit({ auth: authToken });
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      path: fileName.replace('.', '').replace(/^\/+/, '')
    });

    const buffer = Buffer.from(response.data.content, 'base64');
    const spec = buffer.toString('utf8');
    if (format.toLowerCase() === 'yaml') {
      return yaml.load(spec);
    } else {
      return JSON.parse(spec);
    }
  } catch (err) {
    console.error(err);
  }
};

exports.loadSpecLocally = (fileName, format) => {
  try {
    const spec = fs.readFileSync(fileName);
    if (format.toLowerCase() == 'yaml') {
      return yaml.load(spec);
    } else {
      return JSON.parse(spec);
    }

  } catch (err) {
    console.error(err);
  }
};