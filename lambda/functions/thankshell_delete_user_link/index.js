let Auth = require('thankshell-libs/auth.js');
let AWS = require("aws-sdk");

let getProvider = claims => {
    if (!claims.identities) {
        return null;
    }
    return JSON.parse(claims.identities).providerName;
};

let deleteUserLink = async(event) => {
    let claims = event.requestContext.authorizer.claims;

    if (getProvider(claims) == event.pathParameters.type) {
        return {
            statusCode: 403,
            data: {
                message: "連携解除しようとしている手段でログインしています",
            },
        };
    }

    let authId = event.pathParameters.type + ':' + JSON.parse(event.body).id;

    let dynamo = new AWS.DynamoDB.DocumentClient();
    await dynamo.delete({
        TableName: 'thankshell_user_links',
        Key:{
            'auth_id': authId,
        },
    }).promise();

    return {
        statusCode: 200,
        data: {},
    };
};

exports.handler = async(event, context, callback) => {
    try {
        let result = await deleteUserLink(event);

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