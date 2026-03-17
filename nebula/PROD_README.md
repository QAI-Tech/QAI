For Production deployment in the dockerfile,

replace:

```bash
ARG NEXT_PUBLIC_APP_ENV development
ENV NEXT_PUBLIC_APP_ENV ${NEXT_PUBLIC_APP_ENV}
```

with:

```bash
ENV NEXT_PUBLIC_APP_ENV production
```

Also make sure you're using the prod env vars, if not please uncomment them in the .env.local and comment the staging env vars

## Prerequisites Setup

Make sure you're on the main branch with the latest pull

1. Make sure gcloud cli is on production environment (`glcoud config set project qai-tech`)
2. Create a tag locally using the command `git tag -a v.* -m "Commit message"`
3. Then push that tag using this command `git push origin tag_name`

```bash
# Install Docker Desktop (if not installed)
brew install --cask docker

# Login to Google Cloud
gcloud auth login

# Configure Docker authentication for Artifact Registry
gcloud auth configure-docker europe-west3-docker.pkg.dev

# Create a new builder instance and build AMD64 image (for Mac with Apple Silicon)
docker buildx build --platform linux/amd64 \
    -t europe-west3-docker.pkg.dev/qai-tech/nebula-repo/nebula:latest . \
    --push

# Deploy to Cloud Run in europe-west3
gcloud run deploy nebula \
    --image europe-west3-docker.pkg.dev/qai-tech/nebula-repo/nebula:latest \
    --region europe-west3 \
    --platform managed \
    --allow-unauthenticated \
    --port 3000
```

## Cleanup

```bash
# Stop Docker Desktop (when done)
osascript -e 'quit app "Docker Desktop"'
```

## Important Notes

1. The deployment URL will be available in the format:
   https://nebula-[PROJECT_NUMBER].europe-west3.run.app

2. Make sure Docker Desktop is running before executing build and push commands

3. In short this is how we deploy:
   - Start Docker Desktop
   - Build and push new image
   - Deploy to Cloud Run
   - Stop Docker Desktop when done
