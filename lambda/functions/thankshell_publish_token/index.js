let Auth = require('thankshell-libs/auth.js');
let AWS = require("aws-sdk");
let util = require('util');

class TransactionController
{
    constructor(tableInfo, groupInfo) {
        this.dynamo = new AWS.DynamoDB.DocumentClient();
        this.tableInfo = tableInfo;
        this.groupInfo = groupInfo;
        this.reserved = ['--'];
    }

    async getCarried(account) {
        let info = await this.dynamo.get({
            TableName: this.tableInfo['info'],
            Key:{
                'name': this.tableInfo['data'],
            }
        }).promise();
        let maxBlockId = Math.floor(info.Item.current_id_sequence / 1000);

        // Get History
        var history = {
            Count: 0,
            Items: []
        };

        for (var blockId=maxBlockId; blockId >= 0; --blockId) {
            var data = await this.dynamo.query({
                TableName: this.tableInfo['data'],
                KeyConditionExpression: "block_id = :block",
                FilterExpression: "from_account = :account or to_account = :account",
                ExpressionAttributeValues: {
                    ":block": blockId,
                    ":account": account
                }
            }).promise();
            history.Items = history.Items.concat(data.Items);
            history.Count += data.Count;
        }

        // Get Carried
        var carried = 0;
        history.Items.forEach(function(data) {
            if(isFinite(data.amount)) {
                if(data.from_account == account) {
                    carried -= data.amount;
                }
                else if(data.to_account == account) {
                    carried += data.amount;
                }
            }
        }, carried);

        return carried;
    }

    async create(xdata) {
        let date = +(new Date());

        if (!this.validAccount(xdata.from)) {
            throw new Error(`送金元${xdata.from}が無効です`);
        }

        if (!this.validAccount(xdata.to)) {
            throw new Error(`送金先${xdata.to}が無効です`);
        }

        if (xdata.from === xdata.to) {
            throw new Error("自分自身に送金しています");
        }

        if (isNaN(xdata.amount) || xdata.amount <= 0) {
            throw new Error("illigal amount: " + xdata.amount);
        }

        if(xdata.comment && xdata.comment.length > 200) {
            throw new Error("コメントが200文字を超えています");
        }

        let sequence = await this._incrementSequence();
        let item = {
            "block_id": Math.floor(sequence / 1000),
            "transaction_id": sequence,
            "from_account": xdata.from,
            "to_account": xdata.to,
            "type": xdata.token,
            "amount": xdata.amount,
            "timestamp": date,
            "comment": xdata.comment ? xdata.comment : ' ',
        };
        await this._save(item);
    }

    async _incrementSequence() {
        let currentData = await this.dynamo.get({
            TableName: this.tableInfo['info'],
            Key:{
                'name': this.tableInfo['data'],
            },
        }).promise();

        if (!currentData.Item) {
            await this.dynamo.put({
                TableName: this.tableInfo['info'],
                Item: {
                    'name': this.tableInfo['data'],
                    'current_id_sequence': 0
                },
            }).promise();
        }

        let data = await this.dynamo.update({
            TableName: this.tableInfo['info'],
            Key:{
                'name': this.tableInfo['data'],
            },
            UpdateExpression: "set current_id_sequence = current_id_sequence + :val",
            ExpressionAttributeValues:{
                ":val":1
            },
            ReturnValues:"UPDATED_NEW"
        }).promise();

        return data.Attributes.current_id_sequence;
    }

    async _save(item) {
        return await this.dynamo.put({
            TableName: this.tableInfo['data'],
            Item: item
        }).promise();
    }

    validAccount(account) {
        return this.groupInfo.bank_id == account
                || this.reserved.includes(account)
                || this.groupInfo.members.values.includes(account);
    }
}

let getGroupInfo = async(dynamo, groupId) => {
    let data = await dynamo.get({
        TableName: 'thankshell_groups',
            Key:{
                'group_id': groupId,
            }
    }).promise();

    return data.Item;
};

let getTableInfo = (stage) => {
    let tableInfoList = {
        'production': {
            'info': 'table_info',
            'data': 'remittance_transactions',
        },
        'develop': {
            'info': 'dev_table_info',
            'data': 'dev_remittance_transactions',
        },
        'test-invoke-stage' : {
            'info': 'dev_table_info',
            'data': 'dev_remittance_transactions',
        },
    };
    if (!Object.keys(tableInfoList).includes(stage)) {
        throw new Error(util.format("stage '%s' is not supported", stage));
    }
    return tableInfoList[stage];
};

let createTransaction = async(event) => {
    let userId = await Auth.getUserId(event.requestContext.authorizer.claims);
    if(!userId) {
        return {
            statusCode: 403,
            data: {
                "message": "user id not found",
            },
        };
    }

    let token = event.pathParameters.token;
    let body = JSON.parse(event.body);
    let tableInfo = getTableInfo(event.stageVariables.transaction_database);

    if (!token || !body.amount) {
        return {
            statusCode: 403,
            data: {
                "code": "ILLIGAL_PARAMETERS",
                "message": "パラメータが誤っています",
            },
        };
    }

    let groupId = 'sla';
    let dynamo = new AWS.DynamoDB.DocumentClient();
    let groupInfo = await getGroupInfo(dynamo, groupId);

    if(!groupInfo.admins.values.includes(userId)) {
        throw new Error("この取引を発行する権限がありません");
    }

    let controller = new TransactionController(tableInfo, groupInfo);

    let transaction = {};
    transaction.token = token;
    transaction.from = '--';
    transaction.to = groupInfo.bank_id;
    transaction.amount = parseInt(body.amount, 10);
    transaction.comment = body.comment ? body.comment : ' ';

    await controller.create(transaction);
    return {
        statusCode: 200,
        data: {},
    };
};

exports.handler = async(event, context, callback) => {
    try {
        let result = await createTransaction(event);
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
