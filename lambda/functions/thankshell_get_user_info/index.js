let Auth = require('thankshell-libs/auth.js');
let AWS = require("aws-sdk");

// FIXME: Register to auth module
let getUserInfo = async(claims) => {
    let userId;
    let dynamo = new AWS.DynamoDB.DocumentClient();

    if (claims.identities) {
        let identities = JSON.parse(claims.identities);

        let authId = identities.providerName + ':' + identities.userId;
        let result = await dynamo.get({
            TableName: 'thankshell_user_links',
            Key:{
                'auth_id': authId,
            },
        }).promise();

        if (!result.Item) {
            return {
                status: 'UNREGISTERED',
            };
        }

        userId = result.Item['user_id'];
    } else {
        userId = claims['cognito:username'];
    }

    let result = await dynamo.get({
        TableName: 'thankshell_users',
        Key:{
            'user_id': userId,
        },
    }).promise();

    if (result.Item) {
        return result.Item;
    } else {
        return {
            status: 'UNREGISTERED',
            'user_id': userId,
        };
    }
};

let getUsetInfo = async(event) => {
    return {
        statusCode: 200,
        data: await getUserInfo(event.requestContext.authorizer.claims),
    };
};

exports.handler = async (event, context, callback) => {
    try {
        let result = await getUsetInfo(event);

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
                "message": err.message,
            }),
        };
    }
};