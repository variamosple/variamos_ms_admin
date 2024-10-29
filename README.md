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

3. **Install Dependencies:**

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
