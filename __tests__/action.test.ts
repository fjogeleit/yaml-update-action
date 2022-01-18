import * as process from 'process'
import * as path from 'path'
import {runTest, YamlNode} from '../src/action'
import {EnvOptions} from '../src/options'

test('test success', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'backend.version'
  process.env['VALUE'] = 'v1.1.0'
  process.env['BRANCH'] = 'deployment/v1.1.0'

  const {json, yaml} = await runTest<{backend: {version: string}; frontend: YamlNode}>(new EnvOptions())

  expect(json.backend.version).toEqual(process.env['VALUE'])
  console.info(yaml)
})

test('test add new property', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'frontend.version'
  process.env['VALUE'] = 'v1.1.0'

  const {json} = await runTest<{backend: {version: string}; frontend: YamlNode}>(new EnvOptions())

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

  const {json, yaml} = await runTest<{containers: Array<{name: string; image: string}>}>(new EnvOptions())

  expect(json.containers[0].image).toEqual(process.env['VALUE'])
})

test('test array item change - new syntax', async () => {
  process.env['VALUE_FILE'] = 'fixtures/values.yaml'
  process.env['WORK_DIR'] = '__tests__'
  process.env['VALUE_PATH'] = 'containers[0].image'
  process.env['VALUE'] = 'nginx:alpine'

  const {json, yaml} = await runTest<{containers: Array<{name: string; image: string}>}>(new EnvOptions())

  expect(json.containers[0].image).toEqual(process.env['VALUE'])
})
