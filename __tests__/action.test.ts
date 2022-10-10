import * as process from 'process'
import * as path from 'path'
import {runTest} from '../src/action'
import {YamlNode} from '../src/types'
import {EnvOptions} from '../src/options'

test('test success', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'backend.version'
  process.env['VALUE'] = 'v1.1.0'
  process.env['BRANCH'] = 'deployment/v1.1.0'

  const [{json, content}] = await runTest<{backend: {version: string}; frontend: YamlNode}>(new EnvOptions())

  expect(json.backend.version).toEqual(process.env['VALUE'])
  console.info(content)
})

test('test add new property', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'frontend.version'
  process.env['VALUE'] = 'v1.1.0'

  const [{json}] = await runTest<{backend: {version: string}; frontend: YamlNode}>(new EnvOptions())

  expect(json.frontend).toEqual({version: 'v1.1.0'})
})

test('test yaml file path error', async () => {
  process.env['VALUE_FILE'] = 'fixtures/not-exist.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'frontend.version'
  process.env['VALUE'] = 'v1.1.0'

  expect(runTest(new EnvOptions())).rejects.toThrowError(
    `could not parse file with path: ${path.join(__dirname, '..', process.env['WORK_DIR'], process.env['VALUE_FILE'])}`
  )
})

test('test yaml file parse error', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.txt'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'frontend.version'
  process.env['VALUE'] = 'v1.1.0'

  expect(runTest(new EnvOptions())).rejects.toThrowError(`could not parse content as YAML`)
})

test('test array item change - old syntax', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'containers.0.image'
  process.env['VALUE'] = 'nginx:alpine'

  const [{json, content}] = await runTest<{containers: Array<{name: string; image: string}>}>(new EnvOptions())

  expect(json.containers[0].image).toEqual(process.env['VALUE'])
})

test('test array item change - new syntax', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'containers[0].image'
  process.env['VALUE'] = 'nginx:alpine'

  const [{json, content}] = await runTest<{containers: Array<{name: string; image: string}>}>(new EnvOptions())

  expect(json.containers[0].image).toEqual(process.env['VALUE'])
})

test('test bool value', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'config.prod'
  process.env['VALUE'] = "!!bool 'true'"

  const [{json}] = await runTest<{config: {prod: boolean}}>(new EnvOptions())

  expect(json.config.prod).toEqual(true)
})

test('test int value', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'config.version'
  process.env['VALUE'] = "!!int '123456'"

  const [{json}] = await runTest<{config: {version: number}}>(new EnvOptions())

  expect(json.config.version).toEqual(123456)
})

test('multiple changes in one file', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['VALUE_PATH'] = ''
  process.env['VALUE'] = ''
  process.env['WORK_DIR'] = '__tests__'
  process.env['CHANGES'] = '{"backend.version": "v1.1.0", "containers[1].image": "node:alpine"}'

  const [{json, content}] = await runTest<{backend: {version: string}; containers: {name: string; image: string}[]}>(new EnvOptions())

  expect(json.backend.version).toEqual('v1.1.0')
  expect(json.containers[1].image).toEqual('node:alpine')
  console.info(content)
})

test('multiple changes in multiple files', async () => {
  process.env['VALUE_FILE'] = ''
  process.env['VALUE_PATH'] = ''
  process.env['VALUE'] = ''
  process.env['WORK_DIR'] = '__tests__'
  process.env['CHANGES'] = `{
    "fixtures/values.yaml": {"backend.version": "v1.1.0", "containers[1].image": "node:alpine"},
    "fixtures/values.prod.yaml": {"backend.version": "v1.3.0", "frontend": true}
  }`

  const results = await runTest<{backend: {version: string}; fronted: boolean; containers: {name: string; image: string}[]}>(new EnvOptions())

  expect(results[0].json.backend.version).toEqual('v1.1.0')
  expect(results[0].json.containers[1].image).toEqual('node:alpine')
  console.info(results[0].content)

  expect(results[1].json.backend.version).toEqual('v1.3.0')
  expect(results[1].json.frontend).toEqual(true)
  console.info(results[1].content)
})
