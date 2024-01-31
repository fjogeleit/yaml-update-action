import YAML from 'js-yaml'
import * as core from '@actions/core'
import { Changes } from './types'

export const convertValue = (value: string): string | number | boolean => {
  if (!value.startsWith('!!')) {
    return value
  }

  const result = YAML.load(`- ${value}`) as [string | number | boolean]

  return result[0]
}

export const parseChanges = (
  changes: Changes,
  valueFile: string,
  changesString: string
): Changes => {
  if (!changesString) return changes

  let input = null
  try {
    input = JSON.parse(changesString) || {}
  } catch {
    core.warning(`failed to parse JSON: ${changesString}`)
    return changes
  }

  if (!input || typeof input != 'object') {
    return changes
  }

  if (valueFile && !(valueFile in changes)) {
    changes[valueFile] = {}
  }

  for (const [key, item] of Object.entries(input)) {
    if (typeof item != 'object') {
      changes[valueFile][key] = item as string | number | boolean
      continue
    }

    changes[key] = {
      ...changes[key],
      ...item
    }
  }

  return changes
}
