let Auth = require('thankshell-libs/auth.js');
let AWS = require("aws-sdk");

async function getHistory(dynamo, account, stage) {
    let tableName = {
        'production': {
            'info': 'table_info',
            'data': 'remittance_transactions',
        },
        'develop': {
            'info': 'dev_table_info',
            'data': 'dev_remittance_transactions',
        },
    };

    let adminMode = false;

    let history = {
        Count: 0,
        Items: []
    };

    let tableInfo = await dynamo.get({
        TableName: tableName[stage]['info'],
        Key:{
            'name': tableName[stage]['data'],
        }
    }).promise();

    let maxBlockId = tableInfo.Item ? Math.floor(tableInfo.Item.current_id_sequence / 1000) : 0;

    for (let blockId=maxBlockId; blockId >= 0; --blockId) {
        let params;
        if(adminMode) {
            params = {
                TableName: tableName[stage]['data'],
                KeyConditionExpression: "block_id = :block",
                ExpressionAttributeValues: {
                    ":block": blockId
                }
            };
        } else {
            params = {
                TableName: tableName[stage]['data'],
                KeyConditionExpression: "block_id = :block",
                ExpressionAttributeValues: {
                    ":block": blockId,
                }
            };
        }

        var data = await dynamo.query(params).promise();
        history.Items = history.Items.concat(data.Items);
        history.Count += data.Count;
    }

    return history;
}

let getTransactions = async(event) => {
    let userInfo = await Auth.getUserInfo(event.requestContext.authorizer.claims);

    let groupId = event.pathParameters.group;
    let userId = event.pathParameters.user;

    if (userInfo.user_id != userId) {
        return {
            statusCode: 403,
            data: {
                code: "NO_ACCESS_RIGHT",
                message: "アクセス権限がありません",
            }
        };
    }

    let dynamo = new AWS.DynamoDB.DocumentClient();
    let groupInfo = await dynamo.get({
        TableName: 'thankshell_groups',
        Key:{
            'group_id': groupId,
        },
    }).promise();

    let requests = groupInfo.requests ? groupInfo.requests.values : [];

    requests.push(userId);

    await dynamo.update({
        TableName: 'thankshell_groups',
        Key:{
            'group_id': groupId,
        },
        UpdateExpression: "set requests = :val",
        ExpressionAttributeValues:{
            ":val": dynamo.createSet(requests),
        },
        ReturnValues:"UPDATED_NEW"
    }).promise();

    return {
        statusCode: 200,
        data: {},
    };
};

exports.handler = async(event, context, callback) => {
    try {
        let result = await getTransactions(event);
        return {
            statusCode: result.statusCode,
            headers: {"Access-Control-Allow-Origin": "*"},
            body: JSON.stringify(result.data),
        };
    } catch(err) {
        console.log(err);
        return {
            statusCode: 500,
            headers: {"Access-Control-Allow-Origin": "*"},
            body: JSON.stringify({
                'message': err.message,
            }),
        };
    }
};