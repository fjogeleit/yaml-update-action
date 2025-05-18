import { run } from './action.js'
import { GitHubOptions } from './options.js'
import { GitHubActions } from './github-actions.js'

run(new GitHubOptions(), new GitHubActions())
