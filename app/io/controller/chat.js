'use strict';

const Controller = require('egg').Controller;

class ChatController extends Controller {
    async sendMsg() {
        const { ctx, app } = this;
        const nsp = app.io.of('/');
        const [{ message, from_user_id, to_group_id }] = ctx.args;
        // 先写进库
        const { insertId } = await ctx.service.messages.create({
            message,
            from_user_id,
            to_group_id
        });
        const user = await ctx.service.user.findOne({
            id: from_user_id
        });
        nsp.to(to_group_id).emit('message', {
            id: insertId,
            message,
            from_user_id,
            to_group_id,
            username: user.name,
            created_at: new Date()
        });
    }
}

module.exports = ChatController;
