import * as process from 'process'
import * as path from 'path'
import {runTest} from '../src/action'
import {EnvOptions} from '../src/options'

test('test success', async () => {
  process.env['VALUE_FILE'] = '__tests__/fixtures/values.yaml'
  process.env['VALUE_PATH'] = 'backend.version'
  process.env['VALUE'] = 'v1.1.0'
  process.env['BRANCH'] = 'deployment/v1.1.0'

  const {json, yaml} = await runTest<{backend: {version: string}; frontend: boolean}>(new EnvOptions())

  expect(json.backend.version).toEqual(process.env['VALUE'])
  console.info(yaml)
})

test('test yaml value path error', async () => {
  process.env['VALUE_FILE'] = '__tests__/fixtures/values.yaml'
  process.env['VALUE_PATH'] = 'frontend.version'
  process.env['VALUE'] = 'v1.1.0'

  expect(runTest(new EnvOptions())).rejects.toThrowError('invalid property path - frontend is not an object')
})

test('test yaml file path error', async () => {
  process.env['VALUE_FILE'] = '__tests__/fixtures/not-exist.yaml'
  process.env['VALUE_PATH'] = 'frontend.version'
  process.env['VALUE'] = 'v1.1.0'

  expect(runTest(new EnvOptions())).rejects.toThrowError(`could not parse file with path: ${path.join(__dirname, '..', process.env['VALUE_FILE'])}`)
})

test('test yaml file parse error', async () => {
  process.env['VALUE_FILE'] = '__tests__/fixtures/values.txt'
  process.env['VALUE_PATH'] = 'frontend.version'
  process.env['VALUE'] = 'v1.1.0'

  expect(runTest(new EnvOptions())).rejects.toThrowError(`could not parse content as YAML`)
})
