'use strict';

const Controller = require('egg').Controller;

class ChatController extends Controller {
    /**
     * 监听客户端消息，向客户端的群聊或私聊发消息
     */
    async sendMsg() {
        const { ctx, app } = this;
        const nsp = app.io.of('/');
        const [
            {
                is_private,
                message,
                from_user_id,
                to_group_id,
                to_user_id,
                type,
                url
            }
        ] = ctx.args;
        if (is_private === 0) {
            // 写消息表
            const { insertId } = await ctx.service.groupMsg.create({
                message,
                from_user_id,
                to_group_id,
                type,
                url
            });
            // 更新这个人在这个群的最近阅读时间
            await this.service.groupMsg.updateLatestReadTime(
                to_group_id,
                from_user_id
            );
            const user = await ctx.service.user.findOne({
                id: from_user_id
            });
            nsp.to(to_group_id).emit('message', {
                is_private: 0,
                id: insertId,
                message,
                from_user_id,
                to_group_id,
                avatar: user.avatar,
                username: user.name,
                created_at: new Date(),
                type,
                url
            });
        } else {
            const { insertId } = await ctx.service.privateMsg.create({
                message,
                from_user_id,
                to_user_id,
                type,
                url
            });
            // 更新这个人对这个好友的最近阅读时间
            await this.service.privateMsg.updateLatestReadTime(
                to_user_id,
                from_user_id
            );
            const fromUser = await ctx.service.user.findOne({
                id: from_user_id
            });
            const toUser = await ctx.service.user.findOne({
                id: to_user_id
            });
            const data = {
                is_private: 1,
                id: insertId,
                message,
                from_user_id,
                to_user_id,
                avatar: fromUser.avatar,
                username: fromUser.name,
                created_at: new Date(),
                type,
                url
            };
            // 自己也要发
            nsp.to(fromUser.socket_id).emit('message', data);
            nsp.to(toUser.socket_id).emit('message', data);
        }
    }
}

module.exports = ChatController;
