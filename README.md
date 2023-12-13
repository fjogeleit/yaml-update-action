# YAML Update Action

Update values in an existing YAML or JSON File. Push this updated File to an existing branch or create a new branch. Open a PullRequest to a configurable targetBranch. It is also possible to change the file locally without committing the change.


## Use Cases

### Change a local YAML file without committing the change

With the latest release, the content of your actual file will be updated by default. So, you just need to skip the commit of your change.

```yaml
name: 'workflow'
on:
  push:
    branches:
      - main

jobs:
  test-update-file:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Update values.yaml
        uses: fjogeleit/yaml-update-action@main
        with:
          valueFile: 'file.yaml'
          propertyPath: 'file.version'
          value: v1.0.1
          commitChange: false
```

### Update Helm Chart after a new Docker Image was build

Update the image version configuration inside of my helm `values.yaml` after the related GitHub Workflow build and pushed a new version of my Docker Image to the GitHub Package Registry.

```yaml
env:
  IMAGE_NAME: image

jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build app image
        run: docker build . --tag image

      - name: Log into registry
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login docker.pkg.github.com -u ${{ github.actor }} --password-stdin

      - name: Push app image
        id: image
        run: |
          IMAGE_ID=docker.pkg.github.com/${{ github.repository }}/$FILES_IMAGE_NAME
          # Strip git ref prefix from version
          VERSION=$(echo "${{ github.ref }}" | sed -e 's,.*/\(.*\),\1,')
          # Strip "v" prefix from tag name
          [[ "${{ github.ref }}" == "refs/tags/"* ]] && VERSION=$(echo $VERSION | sed -e 's/^v//')
          # Use Docker `latest` tag convention
          [ "$VERSION" == "main" ] && VERSION=$(echo ${{ github.sha }} | cut -c1-8)
          echo IMAGE_ID=$IMAGE_ID
          echo VERSION=$VERSION
          docker tag image $IMAGE_ID:$VERSION
          docker push $IMAGE_ID:$VERSION
          echo "::set-output name=version::$VERSION"

      - name: Update Image Version in the related HelmChart values.yaml
        uses: fjogeleit/yaml-update-action@main
        with:
          valueFile: 'deployment/helm/values.yaml'
          propertyPath: 'backend.version'
          value: ${{ steps.image.outputs.version }}
          branch: deployment/${{ steps.image.outputs.version }}
          targetBranch: development
          createPR: true
          message: 'Update Image Version to ${{ steps.image.outputs.version }}' 
```

## Input Arguments

### Base Configurations

| Argument     | Description                                                                                                                                                                                                                                                                     | Default                                   |
|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------|
| valueFile    | relative path from the Workspace Directory                                                                                                                                                                                                                                      | _required_ Field if `changes` is not used |
| propertyPath | PropertyPath for the new value, JSONPath supported                                                                                                                                                                                                                              | _required_ Field if `changes` is not used |
| value        | New value for the related PropertyPath                                                                                                                                                                                                                                          | _required_ Field if `changes` is not used |
| changes      | Configure changes on multiple values and/or multiple files. Expects all changes as JSON, supported formats are `{"filepath":{"propertyPath":"value"}}` and `{"propertyPath":"value"}`. If you use the second format, it uses the filepath provided from the `valueFile` intput. |                                           |
| updateFile   | **(deprecated)** the updated content will be written into the actual file by default                                                                                                                                                                                            | `false`                                   |
| workDir      | Relative location of the configured `repository`                                                                                                                                                                                                                                | .                                         |                     |
| format       | Specify the used format parser of your file. WIll be guessed by file extension if not provided and uses YAML as fallback. Supports `YAML` and `JSON`                                                                                                                            |                                           |
| method       | Configures the processing of none existing properties. Possible values: `CreateOrUpdate`, `Update`, `Create`                                                                                                                                                                    | `CreateOrUpdate`                          |
| noCompatMode | Removes quotes from reserved words, like Y, N, yes, no, on, etc.                                                                                                                                                                                                                | `false`                                   |
| quotingType | used quotes for string values in YAML output                                                                                                                                                                                                               | `'`                                   |

#### Methods

Determine the behavior for none existing properties or array elements.

| Enum           | Description                                                                   |
|----------------|-------------------------------------------------------------------------------|
| CreateOrUpdate | Updates existing values or creates them if not available                      |
| Update         | Updates existing values, skips the change if not                              |
| Create         | Creates none existing values, skips the change if the property already exists |

### Git related Configurations

| Argument         | Description                                                                                                                                                                                                      | Default                                               |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| commitChange     | Commit the change to __branch__ with the given __message__                                                                                                                                                       | `true`                                                |
| message          | Commit message for the changed YAML file                                                                                                                                                                         | ''                                                    |
| labels           | Comma separated list of labels, e.g. "feature, yaml-updates"                                                                                                                                                     | 'yaml-updates'                                        |
| createPR         | Create a PR from __branch__ to __targetBranch__. Use 'true' to enable it                                                                                                                                         | `true`                                                |
| title            | Custom title for the created Pull Request                                                                                                                                                                        | 'Merge: {{message}}'                                  |
| description      | Custom description for the created Pull Request                                                                                                                                                                  | ''                                                    |
| targetBranch     | Opens a PR from __branch__ to __targetBranch__  if createPR is set to 'true'                                                                                                                                     | `master`                                              |
| repository       | The Repository where the YAML file is located and should be updated. You have to checkout this repository too and set the working-directory for this action to the same as the repository. See the example below | ${{github.repository}}                                |
| branch           | The updated YAML file will be committed to this branch, branch will be created if not exists                                                                                                                     | `master`                                              |
| force            | Allows force pushes                                                                                                                                                                                              | `false`                                               |
| masterBranchName | Branch name of your master branch                                                                                                                                                                                | `master`                                              |
| masterBranchName | Branch name of your master branch                                                                                                                                                                                | `master`                                              |
| githubAPI        | BaseURL for all GitHub REST API requests                                                                                                                                                                         | https://api.github.com                                |
| token            | GitHub API Token which is used to create the PR, have to have right permissions for the selected repository                                                                                                      | ${{github.token}}                                     |
| commitUserName   | Name used for the commit user                                                                                                                                                                                    | github-actions[bot]                                   |
| commitUserEmail  | Email address used for the commit user                                                                                                                                                                           | 41898282+github-actions[bot]@users.noreply.github.com |

### Output

- `commit` Git Commit SHA
- `pull_request` Git PR Information

## Debug Information

Enable Debug mode to get information about

- YAML parse and update results
- Git Steps

## Known Issues

In this first version the updated YAML file will not be patched. It is parsed into JSON, after the update its converted back to YAML. This means that comments and blank lines will be removed in this process and the intend of the updated content can be different to the previous.

By default, each value will be interpreted as string. To use other kinds of value types you can use the specified YAML tags as shown here: [JS-YAML -Supported YAML types](https://github.com/nodeca/js-yaml#supported-yaml-types). Use this syntax as string, see the [test workflows](https://github.com/fjogeleit/yaml-update-action/blob/main/.github/workflows/test.yml) as example

## Examples

### Multi Value Changes

```yaml
jobs:
  test-multiple-value-changes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: fjogeleit/yaml-update-action@main
        with:
          valueFile: 'deployment/helm/values.yaml'
          branch: deployment/dev
          targetBranch: main
          createPR: 'true'
          description: Test GitHub Action
          message: 'Update All Images' 
          title: 'Version Updates '
          changes: |
            {
              "backend.version": "${{ steps.image.outputs.backend.version }}",
              "frontend.version": "${{ steps.image.outputs.frontend.version }}"
            }
```

### Multi File Changes

```yaml
jobs:
  test-multiple-file-changes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: fjogeleit/yaml-update-action@main
        with:
          valueFile: 'deployment/helm/values.yaml'
          branch: deployment/v1.0.1
          targetBranch: main
          createPR: 'true'
          description: Test GitHub Action
          message: 'Update All Images' 
          title: 'Version Updates '
          changes: |
            {
              "__tests__/fixtures/values.dev.yaml": {
                "backend.version": "v1.0.1"
              },
              "__tests__/fixtures/values.stage.yaml": {
                "backend.version": "v1.0.1"
              },
              "__tests__/fixtures/values.prod.yaml": {
                "backend.version": "v1.0.1"
              }
            }
```

### Advaned Example with an separate target repository

```yaml
env:
  IMAGE_NAME: image

jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
            path: main

      - name: Build app image
        run: docker build . --tag image
        working-directory: ./main

      - name: Log into registry
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login docker.pkg.github.com -u ${{ github.actor }} --password-stdin

      - name: Push app image
        id: image
        run: |
          IMAGE_ID=docker.pkg.github.com/${{ github.repository }}/$FILES_IMAGE_NAME
          ....
          echo "::set-output name=version::$VERSION"

      - name: Checkout Target Repository
        uses: actions/checkout@v3
        with:
          repository: owner/target-repository
          path: infrastructure
          token: ${{ secrets.GITHUB_TOKEN }} 

      - name: Update Image Version in the related HelmChart values.yaml
        uses: fjogeleit/yaml-update-action@main
        with:
          valueFile: 'deployment/helm/values.yaml'
          propertyPath: 'backend.version'
          value: ${{ steps.image.outputs.version }}
          repository: owner/target-repository
          branch: deployment/${{ steps.image.outputs.version }}
          targetBranch: development
          createPR: true
          message: 'Update Image Version to ${{ steps.image.outputs.version }}'
          token: ${{ secrets.GITHUB_TOKEN }}
          workDir: infrastructure
```
