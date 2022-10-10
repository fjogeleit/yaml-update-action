/* eslint-disable no-console */
import * as core from '@actions/core'

export interface Actions {
  debug(message: string): void
  info(message: string): void
  warning(message: string): void
  setOutput(name: string, output: string): void
  setFailed(message: string): void
}

export class GitHubActions implements Actions {
  debug(message: string): void {
    core.debug(message)
  }

  info(message: string): void {
    core.info(message)
  }

  warning(message: string): void {
    core.warning(message)
  }

  setOutput(name: string, output: string): void {
    core.setOutput(name, output)
  }

  setFailed(message: string): void {
    core.setFailed(message)
  }
}

export class LogActions implements Actions {
  debug(message: string): void {
    console.info(message)
  }
  info(message: string): void {
    console.info(message)
  }

  warning(message: string): void {
    console.warn(message)
  }

  setOutput(name: string, output: string): void {
    console.log(name, output)
  }

  setFailed(message: string): void {
    console.error(message)
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export class EmptyActions implements Actions {
  debug(message: string): void {}

  info(message: string): void {}

  warning(message: string): void {}

  setOutput(name: string, output: string): void {}

  setFailed(message: string): void {}
}
/* eslint-enable @typescript-eslint/no-unused-vars */
