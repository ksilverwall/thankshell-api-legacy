let Auth = require('thankshell-libs/auth.js');
let AWS = require("aws-sdk");


let getTransactions = async(event) => {
    let userInfo = await Auth.getUserInfo(event.requestContext.authorizer.claims);

    let groupId = event.pathParameters.group;
    let userId = event.pathParameters.user;

    if (userInfo.user_id != userId) {
        return {
            statusCode: 403,
            data: {
                code: "PERMISSION_DENIED",
                message: "アクセス権限がありません",
            },
        };
    }

    let dynamo = new AWS.DynamoDB.DocumentClient();
    let groupInfo = await dynamo.get({
        TableName: 'thankshell_groups',
        Key:{
            'group_id': groupId,
        },
    }).promise();

    if (groupInfo.Item.requests) {
        let requests = groupInfo.Item.requests.values;
        let filtered = requests.filter((element) => {
            return (element != userId);
        });
    
        if (filtered.length == 0) {
            await dynamo.update({
                TableName: 'thankshell_groups',
                Key:{
                    'group_id': groupId,
                },
                UpdateExpression: "remove requests",
                ReturnValues:"UPDATED_NEW"
            }).promise();
        } else {
            await dynamo.update({
                TableName: 'thankshell_groups',
                Key:{
                    'group_id': groupId,
                },
                UpdateExpression: "set requests = :val",
                ExpressionAttributeValues:{
                    ":val": dynamo.createSet(filtered),
                },
                ReturnValues:"UPDATED_NEW"
            }).promise();
        }
    }

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