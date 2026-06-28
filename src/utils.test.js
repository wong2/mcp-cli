import assert from 'node:assert/strict'
import test from 'node:test'
import { buildJSONSchemaQuestions } from './utils.js'

test('buildJSONSchemaQuestions prompts once per anyOf property', () => {
  const questions = buildJSONSchemaQuestions({
    type: 'object',
    properties: {
      a: {
        anyOf: [{ type: 'integer' }, { type: 'number' }],
        title: 'A',
      },
      b: {
        anyOf: [{ type: 'integer' }, { type: 'number' }],
        title: 'B',
      },
    },
    required: ['a', 'b'],
  })

  assert.deepEqual(
    questions.map((question) => question.key),
    ['a', 'b'],
  )
  assert.ok(questions.every((question) => question.type === 'number'))
  assert.ok(questions.every((question) => question.required))
})

test('buildJSONSchemaQuestions keeps direct scalar properties unchanged', () => {
  const questions = buildJSONSchemaQuestions({
    type: 'object',
    properties: {
      name: { type: 'string', default: 'mcp' },
      count: { type: 'integer', minimum: 1 },
      enabled: { type: 'boolean' },
    },
    required: ['name'],
  })

  assert.deepEqual(
    questions.map((question) => [question.key, question.type, question.required]),
    [
      ['name', 'text', true],
      ['count', 'number', false],
      ['enabled', 'confirm', false],
    ],
  )
})

test('buildJSONSchemaQuestions prompts for properties with multi-type arrays', () => {
  const questions = buildJSONSchemaQuestions({
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['store', 'retrieve', 'list', 'delete', 'clear'],
      },
      key: { type: 'string' },
      value: {
        type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
      },
    },
    required: ['action'],
  })

  assert.deepEqual(
    questions.map((question) => [question.key, question.type, question.parseJson]),
    [
      ['action', 'text', undefined],
      ['key', 'text', undefined],
      ['value', 'text', true],
    ],
  )
})
