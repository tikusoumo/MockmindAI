# frozen_string_literal: true

Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/jammy64"
  config.vm.hostname = "ai-voice-agent"

  # Sync the repo into the VM
  config.vm.synced_folder ".", "/vagrant"

  # Forward common dev ports back to host.
  # "Private" ports bind to localhost only (safer default).
  # "Public" ports bind to 0.0.0.0 (reachable on your LAN).
  #
  # Override defaults if needed:
  #   PUBLIC_HOST_IP=0.0.0.0 vagrant up
  #   PRIVATE_HOST_IP=127.0.0.1 vagrant up
  private_host_ip = ENV.fetch("PRIVATE_HOST_IP", "127.0.0.1")
  public_host_ip = ENV.fetch("PUBLIC_HOST_IP", "0.0.0.0")

  # Public (LAN)
  config.vm.network "forwarded_port", guest: 3000, host: 3000, host_ip: public_host_ip, auto_correct: true
  config.vm.network "forwarded_port", guest: 8000, host: 8000, host_ip: public_host_ip, auto_correct: true

  # Private (localhost-only)
  config.vm.network "forwarded_port", guest: 5050, host: 5050, host_ip: private_host_ip, auto_correct: true
  config.vm.network "forwarded_port", guest: 5432, host: 5432, host_ip: private_host_ip, auto_correct: true

  config.vm.provider "virtualbox" do |vb|
    vb.cpus = 2
    vb.memory = 4096
  end

  config.vm.provision "shell", path: "vagrant/provision.sh"
end
