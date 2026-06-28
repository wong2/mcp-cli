import traverse from '@json-schema-tools/traverse'
import { isEmpty, set as setPath, truncate } from 'lodash-es'
import { Console } from 'node:console'
import { homedir } from 'os'
import { join } from 'path'
import prompts from 'prompts'
import { parse } from 'uri-template'
import yoctoSpinner from 'yocto-spinner'
import colors from 'yoctocolors'

export const logger = new Console({ stdout: process.stderr, stderr: process.stderr })

export function prettyPrint(obj) {
  logger.dir(obj, { depth: null, colors: true })
}

export function createSpinner(text) {
  return yoctoSpinner({ text, stream: process.stderr }).start()
}

export function getClaudeConfigPath() {
  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  }
}

export async function readPromptArgumentInputs(args) {
  if (!args || args.length === 0) {
    return {}
  }
  return prompts(
    args.map((arg) => ({
      type: 'text',
      name: arg.name,
      message: colors.dim((arg.required ? '* ' : '') + `${arg.name}: ${arg.description}`),
    })),
  )
}

function getPromptPropertyKey(path) {
  if (path === '$' || !path.includes('.properties.')) {
    return null
  }

  return path
    .replace(/^\$\.properties\./, '')
    .replace(/\.properties\./g, '.')
    .replace(/\.(?:anyOf|oneOf)\[\d+\]/g, '')
}

function isPropertyRequired(schema, keyPath) {
  const parts = keyPath.split('.')
  let current = schema
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current?.properties?.[parts[index]]
  }
  return current?.required?.includes(parts.at(-1)) ?? false
}

function resolvePromptType(schemaNode) {
  const types = Array.isArray(schemaNode.type)
    ? schemaNode.type.filter((type) => type !== 'null')
    : schemaNode.type
      ? [schemaNode.type]
      : []

  if (types.length === 0) {
    return null
  }
  if (types.length === 1) {
    return types[0]
  }

  const scalarTypes = new Set(['string', 'integer', 'number', 'boolean'])
  if (types.every((type) => scalarTypes.has(type))) {
    if (types.includes('integer') || types.includes('number')) {
      return 'number'
    }
    if (types.includes('boolean') && types.length === 1) {
      return 'boolean'
    }
    return 'string'
  }

  return 'json'
}

function pushQuestion(questions, seenKeys, key, schemaType, schemaNode, required) {
  seenKeys.add(key)
  if (schemaType === 'string') {
    questions.push({ key, type: 'text', required, initial: schemaNode.default })
  } else if (schemaType === 'integer' || schemaType === 'number') {
    questions.push({
      key,
      type: 'number',
      required,
      initial: schemaNode.default,
      max: schemaNode.maximum ?? schemaNode.exclusiveMaximum,
      min: schemaNode.minimum ?? schemaNode.exclusiveMinimum,
    })
  } else if (schemaType === 'boolean') {
    questions.push({ type: 'confirm', key, required, initial: schemaNode.default })
  } else if (schemaType === 'json') {
    questions.push({
      key,
      type: 'text',
      required,
      parseJson: true,
      initial: schemaNode.default === undefined ? undefined : JSON.stringify(schemaNode.default),
    })
  }
}

export function buildJSONSchemaQuestions(schema) {
  if (!schema || isEmpty(schema)) {
    return []
  }

  const questions = []
  const seenKeys = new Set()
  traverse.default(schema, (s, _isCycle, path, parent) => {
    const key = getPromptPropertyKey(path)
    if (!key || seenKeys.has(key)) {
      return
    }
    if (parent && parent.type === 'array') {
      return
    }

    const required = isPropertyRequired(schema, key)
    const promptType = resolvePromptType(s)
    if (promptType) {
      pushQuestion(questions, seenKeys, key, promptType, s, required)
    }
  })
  return questions
}

export async function readJSONSchemaInputs(schema) {
  const questions = buildJSONSchemaQuestions(schema)
  if (questions.length === 0) {
    return {}
  }
  const results = {}
  for (const q of questions) {
    const { key, required, parseJson, ...options } = q
    let parsedValue
    while (true) {
      const { value } = await prompts({
        name: 'value',
        message: colors.dim(`${required ? '* ' : ''}${key}${parseJson ? ' (JSON)' : ''}`),
        ...options,
      })
      if (value === '') {
        break
      }
      if (!parseJson) {
        parsedValue = value
        break
      }
      try {
        parsedValue = JSON.parse(value)
        break
      } catch {
        logger.error(colors.red(`Invalid JSON for "${key}". Please try again.`))
      }
    }
    if (parsedValue !== undefined) {
      setPath(results, q.key, parsedValue)
    }
  }
  return results
}

export async function populateURITemplateParts(uriTemplate) {
  const template = parse(uriTemplate)
  let uri = ''
  const values = {}
  logger.log('Constructing URI template:', colors.underline(uriTemplate))
  for (const part of template.ast.parts) {
    if (part.type === 'literal') {
      uri += part.value
    } else if (part.type === 'expression') {
      for (const variable of part.variables) {
        const { value } = await prompts({
          type: 'text',
          name: 'value',
          message: variable.name,
        })
        values[variable.name] = value
      }
    }
  }
  const expanded = template.expand(values)
  logger.info('Constructed resource URI:', colors.underline(expanded))
  const result = await prompts({
    name: 'value',
    type: 'confirm',
    message: 'Confirm resource URI?',
    initial: true,
  })
  return result.value ? expanded : null
}

export function formatDescription(description, compact = false) {
  if (!description || !compact) {
    return description || ''
  }
  const normalized = description.replace(/\s+/g, ' ').trim()
  return truncate(normalized, { length: 100 })
}
