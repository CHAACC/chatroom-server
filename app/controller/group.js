'use strict';

const Controller = require('egg').Controller;
const { isEmpty } = require('lodash');
const uuid = require('uuid/v1');

class GroupController extends Controller {
    /**
     * 创建新群
     */
    async create() {
        const { name } = this.ctx.request.body;
        const isExist = await this.app.mysql.query(
            'SELECT * FROM group_info AS g WHERE g.name = ?',
            [name]
        );
        if (!isEmpty(isExist)) {
            this.ctx.throw(400, `群名【${name}】已经被使用了哦，换一个吧`);
        }
        const to_group_id = uuid();
        const { id: creator_id } = this.ctx.service.auth.decodeToken();
        const created_at = new Date();
        // 随机分配头像
        const avatar = await this.ctx.service.avatar.giveRandomAvatar(0);
        // 新增群
        await this.app.mysql.query(
            'INSERT INTO group_info (to_group_id,name,creator_id,created_at,avatar) VALUES (?,?,?,?,?)',
            [to_group_id, name, creator_id, created_at, avatar]
        );
        // 把建群人加进群
        const ret = await this.app.mysql.query(
            'INSERT INTO group_user_relation (to_group_id,user_id,created_at) VALUES (?,?,?)',
            [to_group_id, creator_id, created_at]
        );
        this.ctx.body = ret;
    }

    async updateGroupInfo() {
        const { gid } = this.ctx.params;
        const { name, avatar } = this.ctx.request.body;
        await this.ctx.service.group.update(gid, {
            name,
            avatar
        });
        const data = await this.ctx.service.group.findOne(gid, [
            'id',
            'to_group_id',
            'avatar',
            'creator_id',
            'name'
        ]);
        this.ctx.body = {
            data
        };
    }

    // 解散群组
    async deleteGroup() {
        const { gid } = this.ctx.params;
        await this.app.mysql.delete('group_info', {
            to_group_id: gid
        });
        await this.ctx.service.groupUserRelation.deleteByGroupId(gid);
        this.ctx.body = {
            data: '解散成功'
        };
    }

    // 退群
    async leaveGroup() {
        const { group_id } = this.ctx.request.body;
        const { id: member_id } = this.ctx.service.auth.decodeToken();
        await this.ctx.service.groupUserRelation.leaveGroup(
            group_id,
            member_id
        );
        this.ctx.body = {
            data: '退群成功'
        };
    }
}

module.exports = GroupController;
