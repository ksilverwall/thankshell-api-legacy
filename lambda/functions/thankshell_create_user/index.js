let Auth = require('thankshell-libs/auth.js');
let AWS = require("aws-sdk");

let createUserLink = async(event) => {
    let claims = event.requestContext.authorizer.claims;
    let userInfo = await Auth.getUserInfo(claims);

    if(userInfo.status != 'UNREGISTERED') {
        return {
            statusCode: 403,
            data: {
                code: "AUTHINFO_ALREADY_REGISTERD",
                message: "指定された認証情報はすでに登録されています",
            },
        };
    }

    let body = JSON.parse(event.body);
    let userId = body.id;

    let dynamo = new AWS.DynamoDB.DocumentClient();

    let result = await dynamo.get({
        TableName: 'thankshell_users',
        Key:{
            'user_id': userId,
        },
    }).promise();

    if (result.Item) {
        return {
            statusCode: 403,
            data: {
                code: "ID_ALREADY_REGISTERD",
                message: "指定したIDは既に使用されています",
            },
        };
    }

    await dynamo.put({
        TableName: 'thankshell_users',
        Item: {
            user_id: userId,
            status: 'ENABLE',
        }
    }).promise();

    if (claims.identities) {
        let identities = JSON.parse(claims.identities);
        let authId = identities.providerType + ':' + identities.userId;
        await dynamo.update({
            TableName: 'thankshell_user_links',
            Key:{
                'auth_id': authId,
            },
            UpdateExpression: 'SET user_id = :value',
            ExpressionAttributeValues: {
                ':value': userId,
            },
        }).promise();

        return {
            statusCode: 200,
            data: {},
        };
    } else {
        return {
            statusCode: 200,
            data: {},
        };
    }
};

exports.handler = async(event, context, callback) => {
    try {
        let result = await createUserLink(event);

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