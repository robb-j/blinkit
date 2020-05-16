# blinkit

Coming soon...

**refs**

- https://github.com/Irrelon/node-blinkt
- https://github.com/pimoroni/blinkt

**thoughts**

- I'm not really sure how the brightness channel works

**commands**

```bash
# ssh root@eclair.local
# cd /usr/src/blinkit

# Link the service into systemd
sudo ln -s /usr/src/blinkit/blinkit.service /lib/systemd/system/blinkit.service

# Setup the daemon
sudo systemctl daemon-reload
sudo systemctl enable blinkit
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

**future work / ideas**

- A socket api to reduce latency

---

> This project was set up by [puggle](https://npm.im/puggle)
