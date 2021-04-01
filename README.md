# YAML Update Action

Update a single value in an existing YAML File. 
Push this updated YAML to an existing branch or create a new branch.
Open a PullRequest to an configurable targetBranch with a custom label "yaml-update"

## Use Case

Update the image version configuration inside of my helm `values.yaml` after the related GitHub Workflow build and pushed a new version of my Docker Image to the GitHub Package Registry

Basic Usage:
```
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
          [ "$VERSION" == "master" ] && VERSION=$(echo ${{ github.sha }} | cut -c1-8)
          echo IMAGE_ID=$IMAGE_ID
          echo VERSION=$VERSION
          docker tag image $IMAGE_ID:$VERSION
          docker push $IMAGE_ID:$VERSION
          echo "::set-output name=version::$VERSION"

      - name: Update Image Version in the related HelmChart values.yaml
        uses: fjogeleit/yaml-update-action@master
        with:
          valueFile: 'deplyoment/helm/values.yaml'
          propertyPath: 'backend.version'
          value: ${{ steps.image.outputs.version }}
          branch: deployment/${{ steps.image.outputs.version }}
          targetBranch: development
          createPR: 'true'
          message: 'Update Image Version to ${{ steps.image.outputs.version }}' 
```

### Input Arguments

|Argument  |  Description  |  Default  |
|----------|---------------|-----------|
|valueFile | relative path from the Workspace Directory| _required_ Field |
|propertyPath| PropertyPath for the new value | _required_ Field |
|value  | New value for the related PropertyPath| _required_ Field |
|repository| The Repository where the YAML file is located and should be updated. You have to checkout this repository too and set the working-directory for this action to the same as the repository. See the example below | ${{github.repository}} |
|commitChange| Commit the change to __branch__ with the given __message__ | 'true' |
|branch    | The updated YAML file will be commited to this branch, branch will be created if not exists | master |
|message| Commit message for the changed YAML file | ''|
|createPR| Create a PR from __branch__ to __targetBranch__. Use 'true' to enable it | 'true' |
|targetBranch| Opens a PR from __branch__ to __targetBranch__  if createPR is set to 'true' | master |
|token| GitHub API Token which is used to create the PR, have to have right permissions for the selected repository | ${{github.token}}|
|workDir| relative location of the configured `repository` | . |

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

```
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
        uses: fjogeleit/yaml-update-action@master
        with:
          valueFile: 'deplyoment/helm/values.yaml'
          propertyPath: 'backend.version'
          value: ${{ steps.image.outputs.version }}
          repository: owner/target-repository
          branch: deployment/${{ steps.image.outputs.version }}
          targetBranch: development
          createPR: 'true'
          message: 'Update Image Version to ${{ steps.image.outputs.version }}'
          token: ${{ secrets.GITHUB_TOKEN }}
          workDir: infrastructure
```
