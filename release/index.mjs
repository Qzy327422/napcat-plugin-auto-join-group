import fs from 'node:fs'
import path from 'node:path'

// 默认配置
const DEFAULT_CONFIG = {
  enabled: true,                    // 插件总开关
  autoJoinGroup: true,              // 自动同意进群
  debug: false,                     // 调试模式
  requireFriendInvite: false,       // 仅限好友邀请
  maxGroupsPerDay: 10,              // 每日最多进群数
  logFile: 'group_join_log.json'    // 日志文件
}

let currentConfig = { ...DEFAULT_CONFIG }
let joinStatistics = {
  todayCount: 0,
  lastResetDate: new Date().toDateString(),
  totalCount: 0,
  history: []
}

// 加载配置
function loadConfig(ctx) {
  const configFilePath = ctx.configPath
  try {
    if (fs.existsSync(configFilePath)) {
      const raw = fs.readFileSync(configFilePath, 'utf-8')
      const loaded = JSON.parse(raw)
      currentConfig = { ...DEFAULT_CONFIG, ...loaded }
      ctx.logger.debug('配置加载成功')
    } else {
      saveConfig(ctx, DEFAULT_CONFIG)
    }
  } catch (error) {
    ctx.logger.error('加载配置失败:', error)
    currentConfig = { ...DEFAULT_CONFIG }
  }
  
  // 加载统计数据
  loadStatistics(ctx)
}

// 保存配置
function saveConfig(ctx, newConfig) {
  currentConfig = { ...currentConfig, ...newConfig }
  const dir = path.dirname(ctx.configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    ctx.configPath,
    JSON.stringify(currentConfig, null, 2),
    'utf-8'
  )
}

// 加载统计数据
function loadStatistics(ctx) {
  const dataPath = ctx.dataPath
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }
  
  const logFilePath = path.join(dataPath, currentConfig.logFile)
  try {
    if (fs.existsSync(logFilePath)) {
      const raw = fs.readFileSync(logFilePath, 'utf-8')
      const loaded = JSON.parse(raw)
      
      // 检查是否需要重置每日计数
      const today = new Date().toDateString()
      if (loaded.lastResetDate !== today) {
        joinStatistics = {
          todayCount: 0,
          lastResetDate: today,
          totalCount: loaded.totalCount || 0,
          history: loaded.history || []
        }
      } else {
        joinStatistics = loaded
      }
    }
  } catch (error) {
    ctx.logger.warn('加载统计数据失败:', error)
  }
}

// 保存统计数据
function saveStatistics(ctx) {
  const dataPath = ctx.dataPath
  const logFilePath = path.join(dataPath, currentConfig.logFile)
  try {
    fs.writeFileSync(
      logFilePath,
      JSON.stringify(joinStatistics, null, 2),
      'utf-8'
    )
  } catch (error) {
    ctx.logger.error('保存统计数据失败:', error)
  }
}

// 记录加群事件
function logGroupJoin(ctx, groupId, groupName, inviterId, inviterName, timestamp) {
  const today = new Date().toDateString()
  if (joinStatistics.lastResetDate !== today) {
    joinStatistics.todayCount = 0
    joinStatistics.lastResetDate = today
  }
  
  joinStatistics.todayCount++
  joinStatistics.totalCount++
  
  const record = {
    groupId,
    groupName: groupName || `群 ${groupId}`,
    inviterId,
    inviterName: inviterName || `用户 ${inviterId}`,
    timestamp: timestamp || new Date().toISOString(),
    date: today
  }
  
  joinStatistics.history.push(record)
  // 只保留最近100条记录
  if (joinStatistics.history.length > 100) {
    joinStatistics.history = joinStatistics.history.slice(-100)
  }
  
  saveStatistics(ctx)
  
  if (currentConfig.debug) {
    ctx.logger.debug(`加群记录: ${JSON.stringify(record)}`)
  }
}

// 构建配置界面
function buildConfigUI(ctx) {
  const { NapCatConfig } = ctx
  return NapCatConfig.combine(
    NapCatConfig.html(`
      <div style="padding: 15px; background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); border-radius: 10px; margin-bottom: 20px; color: white;">
        <h3 style="margin: 0 0 5px 0; font-size: 18px; font-weight: 600;">🤖 自动进群插件</h3>
        <p style="margin: 0; font-size: 13px; opacity: 0.9;">自动同意被邀请加入群聊</p>
      </div>
    `),
    
    NapCatConfig.boolean(
      'enabled',
      '启用插件',
      DEFAULT_CONFIG.enabled,
      '总开关，关闭后插件将不处理任何邀请'
    ),
    
    NapCatConfig.boolean(
      'debug',
      '调试模式',
      DEFAULT_CONFIG.debug,
      '开启后输出详细日志'
    ),
    
    NapCatConfig.html('<h4 style="margin: 20px 0 10px 0; color: #333;">🎯 进群设置</h4>'),
    
    NapCatConfig.boolean(
      'autoJoinGroup',
      '自动同意进群',
      DEFAULT_CONFIG.autoJoinGroup,
      '开启后自动同意所有进群邀请'
    ),
    
    NapCatConfig.boolean(
      'requireFriendInvite',
      '仅限好友邀请',
      DEFAULT_CONFIG.requireFriendInvite,
      '只同意好友的邀请，陌生人邀请将被忽略'
    ),
    
    NapCatConfig.number(
      'maxGroupsPerDay',
      '每日最多进群数',
      DEFAULT_CONFIG.maxGroupsPerDay,
      '限制每天最多同意加入多少个群（0表示无限制）',
      0,
      100
    ),
    
    NapCatConfig.html(`
      <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-radius: 8px;">
        <h4 style="margin: 0 0 8px 0; color: #333;">📊 统计信息</h4>
        <div style="font-size: 13px;">
          <div>今日进群数: <span id="todayCount">${joinStatistics.todayCount}</span></div>
          <div>总进群数: <span id="totalCount">${joinStatistics.totalCount}</span></div>
          <div>上次重置: <span id="lastReset">${joinStatistics.lastResetDate}</span></div>
        </div>
      </div>
    `)
  )
}

// 调用OneBot API
async function callOB11(ctx, action, params) {
  return await ctx.actions.call(
    action,
    params,
    ctx.adapterName,
    ctx.pluginManager.config
  )
}

// 检查是否为好友
async function isFriend(ctx, userId) {
  try {
    const result = await callOB11(ctx, 'get_friend_list', {})
    if (Array.isArray(result)) {
      return result.some(friend => friend.user_id == userId)
    } else if (result?.data && Array.isArray(result.data)) {
      return result.data.some(friend => friend.user_id == userId)
    }
    return false
  } catch (error) {
    ctx.logger.error('检查好友关系失败:', error)
    return false
  }
}

// 获取群信息
async function getGroupInfo(ctx, groupId) {
  try {
    const result = await callOB11(ctx, 'get_group_info', {
      group_id: groupId
    })
    return result
  } catch (error) {
    ctx.logger.warn('获取群信息失败:', error)
    return null
  }
}

// 获取用户信息
async function getUserInfo(ctx, userId) {
  try {
    const result = await callOB11(ctx, 'get_stranger_info', {
      user_id: userId
    })
    return result
  } catch (error) {
    ctx.logger.warn('获取用户信息失败:', error)
    return null
  }
}

// 处理事件
async function onEvent(ctx, event) {
  if (!currentConfig.enabled) return
  if (!currentConfig.autoJoinGroup) return
  
  // 只处理请求事件
  if (event.post_type !== 'request') return
  
  // 只处理加群邀请
  if (event.request_type !== 'group' || event.sub_type !== 'invite') return
  
  const groupId = event.group_id
  const inviterId = event.user_id
  const flag = event.flag
  
  if (currentConfig.debug) {
    ctx.logger.debug(`收到进群邀请: 群${groupId}, 邀请人${inviterId}, flag:${flag}`)
  }
  
  // 检查每日限制
  if (currentConfig.maxGroupsPerDay > 0 && joinStatistics.todayCount >= currentConfig.maxGroupsPerDay) {
    ctx.logger.info(`今日已达到进群限制(${currentConfig.maxGroupsPerDay}个)，忽略邀请`)
    return
  }
  
  // 检查是否仅限好友邀请
  if (currentConfig.requireFriendInvite) {
    const isFriendUser = await isFriend(ctx, inviterId)
    if (!isFriendUser) {
      ctx.logger.info(`邀请人 ${inviterId} 不是好友，忽略邀请`)
      return
    }
  }
  
  try {
    // 同意进群邀请
    await callOB11(ctx, 'set_group_add_request', {
      flag: flag,
      sub_type: 'invite',
      approve: true
    })
    
    ctx.logger.info(`✅ 已同意加入群 ${groupId}，邀请人: ${inviterId}`)
    
    // 获取群信息
    let groupName = `群 ${groupId}`
    try {
      const groupInfo = await getGroupInfo(ctx, groupId)
      if (groupInfo?.data?.group_name) {
        groupName = groupInfo.data.group_name
      }
    } catch (error) {
      // 忽略错误
    }
    
    // 获取邀请人信息
    let inviterName = `用户 ${inviterId}`
    try {
      const userInfo = await getUserInfo(ctx, inviterId)
      if (userInfo?.data?.nickname) {
        inviterName = userInfo.data.nickname
      }
    } catch (error) {
      // 忽略错误
    }
    
    // 记录加群事件
    logGroupJoin(ctx, groupId, groupName, inviterId, inviterName)
    
  } catch (error) {
    ctx.logger.error(`处理进群邀请失败:`, error)
  }
}

// API路由
function registerApiRoutes(ctx) {
  const router = ctx.router
  
  // 获取插件状态
  router.getNoAuth('/status', (_req, res) => {
    res.json({
      code: 0,
      data: {
        pluginName: 'auto-join-group',
        config: currentConfig,
        statistics: joinStatistics
      }
    })
  })
  
  // 获取配置
  router.getNoAuth('/config', (_req, res) => {
    res.json({ code: 0, data: currentConfig })
  })
  
  // 更新配置
  router.postNoAuth('/config', async (req, res) => {
    try {
      const body = req.body
      if (!body) {
        return res.status(400).json({ code: -1, message: "请求体为空" })
      }
      saveConfig(ctx, body)
      ctx.logger.info('配置已更新')
      res.json({ code: 0, message: '配置更新成功' })
    } catch (err) {
      ctx.logger.error('保存配置失败:', err)
      res.status(500).json({ code: -1, message: String(err) })
    }
  })
  
  // 获取加群记录
  router.getNoAuth('/history', (_req, res) => {
    res.json({
      code: 0,
      data: {
        history: joinStatistics.history,
        summary: {
          todayCount: joinStatistics.todayCount,
          totalCount: joinStatistics.totalCount,
          lastResetDate: joinStatistics.lastResetDate
        }
      }
    })
  })
  
  // 重置统计数据
  router.postNoAuth('/reset-stats', (req, res) => {
    try {
      const today = new Date().toDateString()
      joinStatistics = {
        todayCount: 0,
        lastResetDate: today,
        totalCount: 0,
        history: []
      }
      saveStatistics(ctx)
      ctx.logger.info('统计数据已重置')
      res.json({ code: 0, message: '统计数据重置成功' })
    } catch (err) {
      ctx.logger.error('重置统计数据失败:', err)
      res.status(500).json({ code: -1, message: String(err) })
    }
  })
  
  if (currentConfig.debug) {
    ctx.logger.debug('API路由注册完成')
  }
}

// WebUI页面
function registerWebUI(ctx) {
  const router = ctx.router
  
  router.page({
    path: 'dashboard',
    title: '自动进群管理',
    htmlFile: '',
    description: '自动同意被邀请进群管理面板'
  })
  
  if (currentConfig.debug) {
    ctx.logger.debug('WebUI注册完成')
  }
}

// 插件生命周期函数
let plugin_config_ui = []

async function plugin_init(ctx) {
  try {
    loadConfig(ctx)
    plugin_config_ui = buildConfigUI(ctx)
    registerApiRoutes(ctx)
    registerWebUI(ctx)
    
    ctx.logger.info('🤖 自动进群插件初始化完成')
    ctx.logger.info(`📊 今日已加群: ${joinStatistics.todayCount}/${currentConfig.maxGroupsPerDay || '无限制'}`)
  } catch (error) {
    ctx.logger.error('插件初始化失败:', error)
  }
}

async function plugin_get_config() {
  return currentConfig
}

function plugin_on_config_change(ctx, _, key, value) {
  saveConfig(ctx, { [key]: value })
  ctx.logger.debug(`配置变更: ${key}=${value}`)
}

const plugin_onevent = onEvent

export {
  plugin_init,
  plugin_get_config,
  plugin_on_config_change,
  plugin_config_ui,
  plugin_onevent
}