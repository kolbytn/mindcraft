# Specify a base image
# FROM ubuntu:22.04
FROM node:18

#Install some dependencies

RUN apt-get -y update
RUN apt-get -y install git
RUN apt-get -y install unzip
RUN apt-get -y install python3
RUN apt-get -y install python3-pip
RUN apt-get -y install python3-boto3
RUN apt-get -y install python3-tqdm
RUN apt-get -y install tmux

RUN git clone https://github.com/kolbytn/mindcraft.git /mindcraft
WORKDIR /mindcraft
COPY ./server_data.zip /mindcraft
RUN unzip server_data.zip

RUN npm install


# Copy the rest of the application code to the working directory
# RUN apt update
# RUN apt install bash ca-certificates wget git -y # install first to avoid openjdk install bug
# RUN apt install openjdk-17-jre-headless -y
RUN apt install -y wget apt-transport-https gnupg lsb-release

# Add Adoptium repository key
RUN wget -O - https://packages.adoptium.net/artifactory/api/gpg/key/public | apt-key add -

# Add Adoptium repository
RUN echo "deb https://packages.adoptium.net/artifactory/deb $(lsb_release -cs) main" > /etc/apt/sources.list.d/adoptium.list

# Update package lists
RUN apt update

# Install Temurin (Adoptium) Java 21
RUN apt install temurin-21-jdk -y

# Install unzip


RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
RUN unzip awscliv2.zip
RUN ./aws/install

VOLUME /data

EXPOSE 8000