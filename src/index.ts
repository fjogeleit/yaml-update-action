import { run } from './action'
import { GitHubOptions } from './options'
import { GitHubActions } from './github-actions'

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run(new GitHubOptions(), new GitHubActions())
