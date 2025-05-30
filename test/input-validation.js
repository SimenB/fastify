'use strict'

const sget = require('simple-get').concat
const Ajv = require('ajv')
const Joi = require('joi')
const yup = require('yup')
const assert = require('node:assert')

module.exports.payloadMethod = function (method, t) {
  const test = t.test
  const fastify = require('..')()
  const upMethod = method.toUpperCase()
  const loMethod = method.toLowerCase()

  const opts = {
    schema: {
      body: {
        type: 'object',
        properties: {
          hello: {
            type: 'integer'
          }
        }
      }
    }
  }

  const ajv = new Ajv({ coerceTypes: true, removeAdditional: true })
  const optsWithCustomValidator = {
    schema: {
      body: {
        type: 'object',
        properties: {
          hello: {
            type: 'integer'
          }
        },
        additionalProperties: false
      }
    },
    validatorCompiler: function ({ schema, method, url, httpPart }) {
      return ajv.compile(schema)
    }
  }

  const optsWithJoiValidator = {
    schema: {
      body: Joi.object().keys({
        hello: Joi.string().required()
      }).required()
    },
    validatorCompiler: function ({ schema, method, url, httpPart }) {
      return schema.validate.bind(schema)
    }
  }

  const yupOptions = {
    strict: true, // don't coerce
    abortEarly: false, // return all errors
    stripUnknown: true, // remove additional properties
    recursive: true
  }

  const optsWithYupValidator = {
    schema: {
      body: yup.object().shape({
        hello: yup.string().required()
      }).required()
    },
    validatorCompiler: function ({ schema, method, url, httpPart }) {
      return data => {
        try {
          const result = schema.validateSync(data, yupOptions)
          return { value: result }
        } catch (e) {
          return { error: [e] }
        }
      }
    }
  }

  test(`${upMethod} can be created`, t => {
    t.plan(1)
    try {
      fastify[loMethod]('/', opts, function (req, reply) {
        reply.send(req.body)
      })
      fastify[loMethod]('/custom', optsWithCustomValidator, function (req, reply) {
        reply.send(req.body)
      })
      fastify[loMethod]('/joi', optsWithJoiValidator, function (req, reply) {
        reply.send(req.body)
      })
      fastify[loMethod]('/yup', optsWithYupValidator, function (req, reply) {
        reply.send(req.body)
      })

      fastify.register(function (fastify2, opts, done) {
        fastify2.setValidatorCompiler(function schema ({ schema, method, url, httpPart }) {
          return body => ({ error: new Error('From custom schema compiler!') })
        })
        const withInstanceCustomCompiler = {
          schema: {
            body: {
              type: 'object',
              properties: { },
              additionalProperties: false
            }
          }
        }
        fastify2[loMethod]('/plugin', withInstanceCustomCompiler, (req, reply) => reply.send({ hello: 'never here!' }))

        const optsWithCustomValidator2 = {
          schema: {
            body: {
              type: 'object',
              properties: { },
              additionalProperties: false
            }
          },
          validatorCompiler: function ({ schema, method, url, httpPart }) {
            return function (body) {
              return { error: new Error('Always fail!') }
            }
          }
        }
        fastify2[loMethod]('/plugin/custom', optsWithCustomValidator2, (req, reply) => reply.send({ hello: 'never here!' }))

        done()
      })
      t.assert.ok(true)
    } catch (e) {
      t.assert.fail()
    }
  })

  fastify.listen({ port: 0 }, function (err) {
    assert.ifError(err)

    t.after(() => { fastify.close() })

    test(`${upMethod} - correctly replies`, (t, testDone) => {
      if (upMethod === 'HEAD') {
        t.plan(2)
        sget({
          method: upMethod,
          url: 'http://localhost:' + fastify.server.address().port
        }, (err, response) => {
          t.assert.ifError(err)
          t.assert.strictEqual(response.statusCode, 200)
          testDone()
        })
      } else {
        t.plan(3)
        sget({
          method: upMethod,
          url: 'http://localhost:' + fastify.server.address().port,
          body: {
            hello: 42
          },
          json: true
        }, (err, response, body) => {
          t.assert.ifError(err)
          t.assert.strictEqual(response.statusCode, 200)
          t.assert.deepStrictEqual(body, { hello: 42 })
          testDone()
        })
      }
    })

    test(`${upMethod} - 400 on bad parameters`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port,
        body: {
          hello: 'world'
        },
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 400)
        t.assert.deepStrictEqual(body, {
          error: 'Bad Request',
          message: 'body/hello must be integer',
          statusCode: 400,
          code: 'FST_ERR_VALIDATION'
        })
        testDone()
      })
    })

    test(`${upMethod} - input-validation coerce`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port,
        body: {
          hello: '42'
        },
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 200)
        t.assert.deepStrictEqual(body, { hello: 42 })
        testDone()
      })
    })

    test(`${upMethod} - input-validation custom schema compiler`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port + '/custom',
        body: {
          hello: '42',
          world: 55
        },
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 200)
        t.assert.deepStrictEqual(body, { hello: 42 })
        testDone()
      })
    })

    test(`${upMethod} - input-validation joi schema compiler ok`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port + '/joi',
        body: {
          hello: '42'
        },
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 200)
        t.assert.deepStrictEqual(body, { hello: '42' })
        testDone()
      })
    })

    test(`${upMethod} - input-validation joi schema compiler ko`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port + '/joi',
        body: {
          hello: 44
        },
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 400)
        t.assert.deepStrictEqual(body, {
          error: 'Bad Request',
          message: '"hello" must be a string',
          statusCode: 400,
          code: 'FST_ERR_VALIDATION'
        })
        testDone()
      })
    })

    test(`${upMethod} - input-validation yup schema compiler ok`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port + '/yup',
        body: {
          hello: '42'
        },
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 200)
        t.assert.deepStrictEqual(body, { hello: '42' })
        testDone()
      })
    })

    test(`${upMethod} - input-validation yup schema compiler ko`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port + '/yup',
        body: {
          hello: 44
        },
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 400)
        t.assert.deepStrictEqual(body, {
          error: 'Bad Request',
          message: 'body hello must be a `string` type, but the final value was: `44`.',
          statusCode: 400,
          code: 'FST_ERR_VALIDATION'
        })
        testDone()
      })
    })

    test(`${upMethod} - input-validation instance custom schema compiler encapsulated`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port + '/plugin',
        body: {},
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 400)
        t.assert.deepStrictEqual(body, {
          error: 'Bad Request',
          message: 'From custom schema compiler!',
          statusCode: 400,
          code: 'FST_ERR_VALIDATION'
        })
        testDone()
      })
    })

    test(`${upMethod} - input-validation custom schema compiler encapsulated`, (t, testDone) => {
      t.plan(3)
      sget({
        method: upMethod,
        url: 'http://localhost:' + fastify.server.address().port + '/plugin/custom',
        body: {},
        json: true
      }, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.strictEqual(response.statusCode, 400)
        t.assert.deepStrictEqual(body, {
          error: 'Bad Request',
          message: 'Always fail!',
          statusCode: 400,
          code: 'FST_ERR_VALIDATION'
        })
        testDone()
      })
    })
  })
}
