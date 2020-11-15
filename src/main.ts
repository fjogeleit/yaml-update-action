import {run} from './action'
import {GitHubOptions} from './options'
import {GitHubActions} from './github-actions'

run(new GitHubOptions(), new GitHubActions())
