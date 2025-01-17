const _ = require('../utils')
const querystring = require('querystring')
const insistentReq = require('./insistent_req')
const throwErrorRes = require('./throw_error_res')

module.exports = (getAuthData, loggers) => {
  const { logError, Log, LogError } = loggers
  return (action, data, config) => {
    const tryIt = () => {
      return getAuthData()
      .then(actionPost(action, data, config))
      .then(Log(`POST ${action} res`))
      .catch(LogError(`POST ${action} err`))
    }

    return tryIt()
    .catch(err => {
      logError(`failed ${action} attempt`, err)
      // Known case of required retrial: token expired
      if (isAuthError(err)) getAuthData({ refresh: true })
      // And retry
      return tryIt()
    })
  }
}

const actionPost = (action, data, config) => authData => {
  const { instance, userAgent, bot, summary } = config
  const { oauth } = config.credentials
  const { cookie, token } = authData

  data.token = token
  data.summary = summary

  const query = { action, format: 'json' }
  if (bot) query.bot = true
  data.assert = bot ? 'bot' : 'user'

  const url = _.buildUrl(`${instance}/w/api.php`, query)
  const params = {
    url,
    oauth,
    headers: {
      'Cookie': cookie,
      'User-Agent': userAgent,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    // Formatting as form-urlencoded
    body: querystring.stringify(data)
  }

  return insistentReq('post', params)
  .get('body')
  .then(throwErrorRes('post err', params))
}

const isAuthError = err => {
  if (!(err && err.body && err.body.error)) return false
  const errorCode = err.body.error.code || ''
  // Known matching error codes: badtoken, notoken, assertuserfailed
  return errorCode.match(/(token|auth)/)
}
