import subprocess
import json
import requests
import zipfile
import os


def get_function_names():
    result = json.loads(subprocess.check_output(['aws', '--profile', 'thankshell', 'lambda', 'list-functions']))

    return [ f['FunctionName'] for f in result['Functions'] if f['FunctionName'].startswith('thankshell')]

if __name__ == '__main__':
    lambda_dir = os.path.dirname(os.path.abspath(__file__))

    function_names = get_function_names()

    for fname in function_names:
        result = json.loads(subprocess.check_output(['aws', '--profile', 'thankshell', 'lambda', 'get-function', '--function-name', fname]))
        response = requests.get(result['Code']['Location'])
        with open('tmp.zip', 'wb') as fp:
            fp.write(response.content)

        with zipfile.ZipFile('tmp.zip') as existing_zip:
            existing_zip.extractall(lambda_dir + '/' + fname)

        os.remove('tmp.zip')
