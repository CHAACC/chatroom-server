'use strict';

const Controller = require('egg').Controller;
const assert = require('assert');
const { generateToken } = require('../utils/token');
const bcrypt = require('bcrypt');
const fs = require('mz/fs');
const path = require('path');
const { isEmpty } = require('lodash');
const moment = require('moment');

class UserController extends Controller {
    async login() {
        const { name, password } = this.ctx.request.body;
        const user = await this.ctx.service.user.findOne({ name });
        assert(user, '用户名不存在');
        const isPasswordCorrect = bcrypt.compareSync(password, user.password);
        assert(isPasswordCorrect, '密码错误');
        const token = generateToken(user.id);
        this.ctx.body = {
            data: {
                token,
                userInfo: {
                    id: user.id,
                    username: user.name,
                    avatar: user.avatar
                }
            },
            message: '登录成功'
        };
    }
    async register() {
        const { name, password } = this.ctx.request.body;
        const user = await this.ctx.service.user.findOne({ name });
        assert(!user, '用户名已经被注册');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const params = {
            name,
            password: hash,
            salt,
            created_at: new Date()
        };
        const { insertId } = await this.ctx.service.user.create(params);
        const token = generateToken(insertId);
        // 加到默认群组
        await this.ctx.service.group.groupAddUser({
            to_group_id: 1,
            user_id: insertId
        });

        this.ctx.body = {
            data: {
                token,
                userInfo: {
                    id: insertId,
                    username: name
                }
            },
            message: '注册成功'
        };
    }
    async logout() {
        const { ctx } = this;
        const { uid } = ctx.params;
        await ctx.service.user.update({
            id: uid,
            status: 0,
            socket_id: null
        });
        this.ctx.body = {};
        // 通知所在群这个人下线了
        await this.ctx.service.group.emitLoginStatus(uid);
    }
    async uploadAvatar() {
        const { ctx } = this;
        const { user_id } = ctx.request.query;
        const file = ctx.request.files[0];
        const basename = path.basename(file.filepath);
        const destUrl = path.resolve('app/public/avatar', basename);
        try {
            // 查现在的头像地址
            const { avatar } = await ctx.service.user.findOne({
                id: user_id
            });
            // 删现在的头像
            if (avatar) {
                await fs.unlink(path.resolve('app', avatar));
            }
            // 复制到public目录下
            await fs.copyFile(file.filepath, destUrl);
            // 更新用户表
            await ctx.service.user.update({
                id: user_id,
                avatar: `public/avatar/${basename}`
            });
            this.ctx.body = {
                data: {
                    avatar: `public/avatar/${basename}`
                }
            };
        } finally {
            // 删除临时文件
            await fs.unlink(file.filepath);
        }
    }
    async updateUserInfo() {
        const { uid } = this.ctx.params;
        const { username, oldpsw, newpsw } = this.ctx.request.body;
        let hash;
        if (oldpsw) {
            const { password } = await this.ctx.service.user.findOne({
                id: uid
            });
            const isCorrect = await bcrypt.compare(oldpsw, password);
            assert(isCorrect, '旧密码错误');

            const salt = await bcrypt.genSalt(10);
            hash = await bcrypt.hash(newpsw, salt);
        }
        await this.ctx.service.user.update({
            id: uid,
            name: username,
            password: hash
        });

        this.ctx.body = {
            success: true
        };
    }

    /**
     * 搜索群和用户
     */
    async searchUsersAndGroups() {
        const { keyword } = this.ctx.request.query;
        const ret = {};
        if (!keyword) {
            this.ctx.body = {
                data: ret,
                total: 0
            };
            return;
        }
        // 查用户表
        const userRet = await this.app.mysql.query(
            `select id, name, avatar from user where name like '%${keyword}%'`
        );
        if (!isEmpty(userRet)) {
            ret.users = userRet;
        }
        // 查群表
        const groupRet = await this.app.mysql.query(
            `select * from group_info where name like '%${keyword}%'`
        );
        if (!isEmpty(groupRet)) {
            ret.groups = groupRet;
        }
        this.ctx.body = {
            data: ret,
            total: userRet.length + groupRet.length
        };
    }

    /**
     * 加好友
     */
    async addFriend() {
        const { uid } = this.ctx.params;
        const { id } = this.ctx.service.auth.decodeToken();
        const ret = await this.app.mysql.select('user_user_relation', {
            user_id: id,
            friend_id: uid
        });
        assert(isEmpty(ret), '对方已经是你的好友');
        await this.app.mysql.insert('user_user_relation', {
            user_id: id,
            friend_id: uid,
            created_at: moment().format('YYYY-MM-DD HH:mm:ss')
        });
        await this.app.mysql.insert('user_user_relation', {
            user_id: uid,
            friend_id: id,
            created_at: moment().format('YYYY-MM-DD HH:mm:ss')
        });

        this.ctx.body = {
            data: {}
        };
    }
}

module.exports = UserController;
