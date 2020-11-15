# YAML Update Action

Update a single value in an existing YAML File. 
Push this updated YAML to an existing branch or create a new branch
Open a PullRequest to an configurable targetBranch with a custom label "yaml-update"

## Use Case

Update the image version configuration inside of my helm `values.yaml` after the related GitHub Workflow build and pushed a new version of my Docker Image to the GitHub Package Registry

Example Usage:
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
|branch    | The updated YAML file will be commited to this branch, branch will be created if not exists | _required_ Field |
|message| Commit message for the changed YAML file |_required_ Field|
|createPR| Create a PR from __branch__ to __targetBranch__. Use 'true' to enable it | 'true' |
|targetBranch| Opens a PR from __branch__ to __targetBranch__  if createPR is set to 'true' | master |
|token| GitHub API Token which is used to create the PR | ${{ github.token }}|
|author_name| Used Git user.name configuration |${{ github.actor }}|
|author_email| Used Git user.email configuration | ${{ github.actor }}@users.noreply.github.com |

### Output

- `commit` Git Commit Informations
- `push` Git Push Informations
- `pull_request` Git PR Informations


### Debug Informations

Enable Debug mode to get informations about

- YAML parse and update results
- Git Steps

### Known Issues

In this first version the updated YAML file will not be patched. It is parsed into JSON, after the updated its updated back to YAML. This means that comments and blank lines will be removed in this provess and the intend of the updated content can be different to the previous