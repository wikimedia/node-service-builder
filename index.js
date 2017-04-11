'use strict';

const docker = require('./lib/docker');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

function getOptions() {
    // check process arguments
    const args = require('yargs')
    .usage('Usage: $0 [command] [options]')
    .options({
        n: {
            alias: 'num-workers',
            default: -1,
            describe: 'number of workers to start',
            nargs: 1,
            global: true
        },
        c: {
            alias: 'config',
            default: './config.yaml',
            describe: 'YAML-formatted configuration file',
            type: 'string',
            nargs: 1,
            global: true
        },
        verbose: {
            default: false,
            describe: 'be verbose',
            type: 'boolean',
            global: true
        }
    })
    .command('run', 'starts the service in a Docker container')
    .command('test', 'starts the test process in a Docker container')
    .command('build', 'builds the service\'s package and deploy repo', {
        f: {
            alias: 'force',
            default: false,
            describe: 'force the operation to execute',
            type: 'boolean'
        },
        d: {
            alias: 'deploy-repo',
            default: false,
            describe: 'build only the deploy repo',
            type: 'boolean'
        },
        s: {
            alias: 'reshrinkwrap',
            default: false,
            describe: 'rebuild shrinkwrap.json by removing and regenerating after npm install',
            type: 'boolean'
        },
        r: {
            alias: 'review',
            default: false,
            describe: 'send the patch to Gerrit after building the repo',
            type: 'boolean'
        }
    })
    .command('generate', 'generates the Dockerfile specification for the service', {
        r: {
            alias: 'running',
            default: false,
            describe: 'generate the Dockerfile to start the service',
            type: 'boolean'
        },
        t: {
            alias: 'testing',
            default: false,
            describe: 'generate the Dockerfile to test the service',
            type: 'boolean'
        },
        b: {
            alias: 'building',
            default: false,
            describe: 'generate the Dockerfile to build the deployment repository',
            type: 'boolean'
        },
    })
    .help('h')
    .alias('h', 'help')
        .argv;

    args.deployRepo = args.deployRepo || args.review;
    args.build = args._.indexOf('build') !== -1 || args.deployRepo;
    args.dockerStart = args._.indexOf('docker-start') !== -1;
    args.dockerTest = args._.indexOf('docker-test') !== -1;
    args.generate = args._.indexOf('generate') !== -1;
    args.deployRepo = args.deployRepo || args.build || args.building;

    if ([args.build, args.dockerStart, args.dockerTest, args.generate]
        .filter(x => !!x).length > 1) {
        console.error('Only one command can be specified!');
        process.exit(1);
    }

    return {
        num_workers: args.numWorkers,
        configFile: args.config,
        build: args.build,
        buildDeploy: args.deployRepo,
        reshrinkwrap: args.reshrinkwrap,
        sendReview: args.review,
        dockerStart: args.dockerStart || args.running,
        dockerTest: args.dockerTest || args.testing,
        generate: args.generate,
        useDocker: args.deployRepo || args.dockerStart || args.dockerTest || args.generate,
        force: args.force,
        verbose: args.verbose
    };
}

function getAppBasePath(config) {
    if (process.env.APP_BASE_PATH) {
        return process.env.APP_BASE_PATH;
    } else if (config.app_base_path) {
        return config.app_base_path;
    } else if (/\/node_modules\/service-builder\/lib$/.test(__dirname)) {
        // Default to guessing the base path
        return path.resolve(`${__dirname}/../../../`);
    } else {
        return path.resolve('./');
    }
}

function replaceEnvVars(config) {
    const envRegex = /\{\s*env\(([^,\s)]+),?\s*([^)]+)?\)\s*}/g;
    if (Buffer.isBuffer(config)) {
        config = config.toString();
    }
    return config.replace(envRegex, (match, envName, defValue) => {
        if (process.env[envName] !== undefined) {
            return process.env[envName];
        }
        if (defValue !== undefined) {
            return defValue;
        }
        return '';
    });
}

function main() {
    const options = getOptions();
    let configFile = options.configFile;
    if (!/^\//.test(configFile)) {
        // resolve relative paths
        configFile = path.resolve(`${process.cwd()}/${configFile}`);
    }
    const configSource = replaceEnvVars(fs.readFileSync(configFile));
    const config = yaml.load(configSource);
    options.basePath = getAppBasePath(config);
    return docker(options, config);
}
main();
