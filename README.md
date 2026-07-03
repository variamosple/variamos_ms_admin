# VariaMos Admin Microservice

## How to Run

### Prerequisites

- Node.js version 18 or greater
- PostgreSQL database

### Configuration

1. **Create Public and Private Keys for Session Management:**

   - Generate a private key:
     ```shell
     openssl genpkey -algorithm RSA -out jwtRS256.key -pkeyopt rsa_keygen_bits:4096
     ```
   - Generate a public key:
     ```shell
     openssl rsa -in jwtRS256.key -pubout -out jwtRS256.key.pub
     ```

2. **Initialize Environment Variables for Development:**

   - Use the `./env/development.env` file.
   - Set the `VARIAMOS_PRIVATE_KEY_PATH` in `./env/development.env`:
     ```env
     VARIAMOS_PRIVATE_KEY_PATH=./jwtRS256.key
     ```
   - Set the `VARIAMOS_PUBLIC_KEY_PATH` in `./env/development.env`:
     ```env
     VARIAMOS_PUBLIC_KEY_PATH=./jwtRS256.key.pub
     ```

3. **Configure SMTP Variables for Emails (Optional for Dev):**
   
   Configure the following environment variables in `./env/development.env` (or let them blank to simulate emails in console logs):
   - `SMTP_HOST`: Host address of the SMTP server.
   - `SMTP_PORT`: SMTP port (e.g., 587 for TLS, 465 for SSL).
   - `SMTP_USER`: SMTP username or authentication email.
   - `SMTP_PASSWORD`: SMTP authentication password.
   - `SMTP_FROM`: Sender name and address (e.g., `"VariaMos" <noreply@variamos.com>`).

4. **Configure GitHub Integration (Bot or PAT):**

   To allow the microservice to synchronize issues and manage bug reports on GitHub, define the following variables in your `.env` files:
   - `GITHUB_TOKEN`: A Personal Access Token (PAT) for fallback authentication.
   - `GITHUB_MANAGED_REPOS`: A comma-separated list of GitHub repositories (e.g. `owner/repo-name`) to monitor.
   - `GITHUB_APP_ID`: The App ID of your GitHub App bot.
   - `GITHUB_PRIVATE_KEY`: The RSA private key of your GitHub App, formatted on a single line. Replace all real newlines with `\n` characters, surrounded by double quotes.
      
     You can format your downloaded `.pem` file with this command:
     ```shell
     awk '{printf "%s\\n", $0}' path/to/key.pem
     ```
     Example format:
     ```env
     GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQ...\n-----END RSA PRIVATE KEY-----"
     ```

5. **Install Dependencies:**

   - Run the following command:
     ```shell
     npm install
     ```

### Running the Application

- To run the application locally, use:
  ```shell
  npm run dev
  ```

### Generating a Docker Image

1. **Build the Docker Image:**

   - Ensure you are in the root folder and execute:
     ```shell
     docker build -t variamos/admin-ms .
     ```

### Running the Docker Image

1. **Create a Network:**

   - Execute the following command to create a network called `variamos`:
     ```shell
     docker network create variamos
     ```

2. **Run the Docker Image:**

   - Execute:
     ```shell
     docker run -d --name variamos-ms-admin --network variamos -p 4000:4000 --env-file ./env/docker.env -v full-path-to-app-config-files/docker-config:/mnt/app-config variamos/admin-ms:latest
     ```
   - Explanation of the command:

     - `-d`: Runs the container in detached mode, freeing the console after the container starts.
     - `--name variamos-ms-admin`: Names the container `variamos-ms-admin`.
     - `--network variamos`: Connects the container to the `variamos` network.
     - `-p 4000:4000`: Maps port `4000` on the host machine to port `4000` in the container. To use a different port, update the `PORT=` entry in the `./env/docker.env` file. If it does not exist, create `./env/docker.env` from `./env/development.env`.
     - `--env-file ./env/docker.env`: Loads environment variables from `./env/docker.env`.
     - `-v full-path-to-app-config-files/docker-config:/mnt/app-config`: Maps the `full-path-to-app-config-files/docker-config` folder to `/mnt/app-config`, replace it with your own folder, remember to use full path not relative. This is useful for providing private and public keys (`jwtRS256.key` and `jwtRS256.key.pub`). Create a copy of the `jwtRS256.key` and `jwtRS256.key.pub` keys in your `full-path-to-app-config-files` folder and update `./env/docker.env`:

       ```env
       VARIAMOS_PRIVATE_KEY_PATH=/mnt/app-config/jwtRS256.key
       VARIAMOS_PUBLIC_KEY_PATH=/mnt/app-config/jwtRS256.key.pub
       ```

     - `variamos/admin-ms:latest`: Specifies the Docker image to use, in this case, the latest image created with the name `variamos/admin-ms` using the `docker build` command.

### Working with a PostgreSQL Docker Container

If you are working locally with a PostgreSQL Docker container, you should update the database container network to use the `variamos` network you created in the previous steps. Use the following command:

```shell
docker network connect variamos <container-name>
```

Replace `<container-name>` with the name of your PostgreSQL container.
