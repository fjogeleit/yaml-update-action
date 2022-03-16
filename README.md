# YAML Update Action

Update a single value in an existing YAML File. Push this updated YAML to an existing branch or create a new branch. Open a PullRequest to a configurable targetBranch. It is also posible to change the file locally without commiting the change.


## Use Cases

### Change a local YAML file without commiting the change

By default the actual file in your workspace did not change. This Action creates an in memory copy of your YAML file and sends it to GitHub via the REST API. To achieve an actual update of your local YAML file within your workflow use the following configuration:

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
      - uses: actions/checkout@v2
      - name: Update values.yaml
        uses: fjogeleit/yaml-update-action@main
        with:
          valueFile: 'file.yaml'
          propertyPath: 'file.version'
          value: v1.0.1
          commitChange: false
          updateFile: true
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
      - uses: actions/checkout@v2

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

### Input Arguments

|Argument  |  Description  |  Default  |
|----------|---------------|-----------|
|valueFile | relative path from the Workspace Directory| _required_ Field |
|propertyPath| PropertyPath for the new value, JSONPath supported | _required_ Field |
|value  | New value for the related PropertyPath| _required_ Field |
|repository| The Repository where the YAML file is located and should be updated. You have to checkout this repository too and set the working-directory for this action to the same as the repository. See the example below | ${{github.repository}} |
|commitChange| Commit the change to __branch__ with the given __message__ | true |
|branch    | The updated YAML file will be commited to this branch, branch will be created if not exists | master |
|message| Commit message for the changed YAML file | ''|
|title| Custom title for the created Pull Request | 'Merge: {{message}}'|
|description| Custom description for the created Pull Request | ''|
|labels| Comma separated list of labels, e.g. "feature, yaml-updates" | 'yaml-updates'|
|createPR| Create a PR from __branch__ to __targetBranch__. Use 'true' to enable it | true |
|targetBranch| Opens a PR from __branch__ to __targetBranch__  if createPR is set to 'true' | master |
|githubAPI| BaseURL for all GitHub REST API requests | https://api.github.com |
|token| GitHub API Token which is used to create the PR, have to have right permissions for the selected repository | ${{github.token}}|
|reviewers| List of Usernames to add as reviewers to the created Pull Request, e.g. "fjogeleit, username2" |  |
|teamReviewers| List of Teamslugs to add as team reviewers to the created Pull Request |  |
|assignees| List of Usernames to add as assignees to the created Pull Request |  |
|commitUserName| Name used for the commit user | GitHub Actions |
|commitUserEmail| Email address used for the commit user | actions@github.com |
|updateFile| By default the actual file is not updated, to do so set this property to 'true' | false |
|workDir| relative location of the configured `repository` | . |
|masterBranchName| Branch name of your master branch | `master` |

### Output

- `commit` Git Commit SHA
- `pull_request` Git PR Informations

### Debug Informations

Enable Debug mode to get informations about

- YAML parse and update results
- Git Steps

### Known Issues

In this first version the updated YAML file will not be patched. It is parsed into JSON, after the update its converted back to YAML. This means that comments and blank lines will be removed in this process and the intend of the updated content can be different to the previous.

At this point in time only string values are supported

### Advaned Example with an separate target repository

```yaml
env:
  IMAGE_NAME: image

jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
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
        uses: actions/checkout@v2
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
