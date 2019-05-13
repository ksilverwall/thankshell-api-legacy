import subprocess
import json
import requests
import zipfile
import os

if __name__ == '__main__':
    lambda_dir = os.path.dirname(os.path.abspath(__file__))

    api_id = '7sq9flro08'
    rest_api = json.loads(subprocess.check_output([
        'aws',
        '--profile', 'thankshell',
        'apigateway',
        'get-rest-api',
        '--rest-api-id', api_id,
    ]))

    with open(lambda_dir + '/rest_api.json', 'w') as f:
        f.write(json.dumps(rest_api, indent=4) + "\n")

    result = subprocess.check_output([
        'aws',
        '--profile', 'thankshell',
        'apigateway',
        'get-export',
        '--rest-api-id', api_id,
        '--stage-name', 'develop',
        '--export-type', 'swagger',
        lambda_dir + '/export.json',
    ])

    resources = json.loads(subprocess.check_output([
        'aws',
        '--profile', 'thankshell',
        'apigateway',
        'get-resources',
        '--rest-api-id', api_id,
    ]))

    with open(lambda_dir + '/resources.json', 'w') as f:
        f.write(json.dumps(resources, indent=4) + "\n")

    data = {}
    for r in sorted(resources['items'], key=lambda r:r['id']):
        resource_id = r['id']
        if 'resourceMethods' not in r:
            continue

        resourceInfo = {}
        for m in sorted(r['resourceMethods'].keys()):
            method = json.loads(subprocess.check_output([
                'aws',
                '--profile', 'thankshell',
                'apigateway',
                'get-method',
                '--rest-api-id', api_id,
                '--resource-id', resource_id,
                '--http-method', m,
            ]))
            resourceInfo[m] = method

        data[resource_id] = resourceInfo

    with open(lambda_dir + '/methods.json', 'w') as f:
        f.write(json.dumps(data, indent=4) + "\n")
