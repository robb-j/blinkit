# blinkit

Coming soon...

**refs**

- https://github.com/Irrelon/node-blinkt
- https://github.com/pimoroni/blinkt

**commands**

```bash
# ssh root@eclair.local
# cd /usr/src/blinkit

# Link the service into systemd
sudo ln -s /usr/src/blinkit/blinkit.service /lib/systemd/system/blinkit.service

# Setup the daemon
sudo systemctl daemon-reload
sudo systemctl start blinkit

# Watch logs
journalctl -fu blinkit
```

**experimental client**

```bash
./hack/client.js
./hack/client.js pulse
./hack/client.js patch white
./hack/client.js tick
./hack/client.js off
```

---

> This project was set up by [puggle](https://npm.im/puggle)
