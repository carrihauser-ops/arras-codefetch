(async () => {
                if (!window.WebAssembly) {
                    let e = document.createElement("div");
                    e.textContent = "WebAssembly is not supported on your browser! Please upgrade your browser to the latest version.",
                    e.style.position = "absolute",
                    e.style.top = "0",
                    e.style.width = "100%",
                    e.style.padding = "20px",
                    e.style.background = "red",
                    e.style.color = "white",
                    e.style.font = "bold 20px sans-serif",
                    document.body.appendChild(e);
                    return
                }
                let e = [null, Function]
                  , t = (t, a) => {
                    e[t] = a
                }
                  , a = null
                  , r = () => ((null == a || 0 === a.byteLength) && (a = new Uint8Array(h.g.buffer)),
                a)
                  , o = null
                  , n = () => ((null == o || 0 === o.byteLength) && (o = new Int32Array(h.g.buffer)),
                o)
                  , l = null
                  , s = new TextEncoder("utf-8")
                  , d = new TextDecoder("utf-8",{
                    ignoreBOM: !0
                });
                d.decode();
                let i = /^[\x00-\x7f]*$/
                  , c = (e, t) => {
                    if (null == t) {
                        n().set([0, 0], e >> 2);
                        return
                    }
                    "string" != typeof t && (t = String(t));
                    if (i.test(t)) {
                        let a = h.c(t.length, 1)
                          , o = r();
                        for (let e = 0; e < t.length; e++)
                            o[a + e] = t.charCodeAt(e);
                        n().set([a, t.length], e >> 2)
                    } else
                        u(e, s.encode(t))
                }
                  , u = (e, t) => {
                    if (null == t) {
                        n().set([0, 0], e >> 2);
                        return
                    }
                    let a = h.c(t.length, 1);
                    r().set(t, a),
                    n().set([a, t.length], e >> 2)
                }
                  , b = [[ (e, t) => {
                    console.log(d.decode(r().subarray(e, e + t)))
                }
                , t => e[t][0], t => {
                    e[t].lineCap = "butt"
                }
                , t => {
                    e[t].lineJoin = "miter"
                }
                , (t, a, r) => c(t, e[a][r].host), (a, r) => t(a, Object.values(e[r].shift().status)), e => t(e, null), (t, a, o) => e[t](r().subarray(a, a + o)), (t, a) => c(t, e[a]()), (t, a, r, o, n) => {
                    e[t].fillRect(a, r, o, n)
                }
                , t => {
                    e[t].beginPath()
                }
                , (a, r, o, n) => t(a, e[r].getProgramParameter(e[o], n >>> 0)), (t, a, r, o, n, l, s, d, i, c) => {
                    try {
                        e[t].drawImage(e[a], r, o, n, l, s, d, i, c)
                    } catch (e) {}
                }
                , t => e[t], (t, a, o, n) => e[t].getAttribLocation(e[a], d.decode(r().subarray(o, o + n))), (t, a) => {
                    t = e[t],
                    a >>>= 0,
                    t.fillStyle = `rgb(${a >> 16},${a >> 8 & 255},${255 & a})`
                }
                , (t, a, r, o, n) => {
                    e[t].clearRect(a, r, o, n)
                }
                , (t, a, r, o, n) => {
                    e[t].blendColor(a, r, o, n)
                }
                , t => e[t].pop(), t => e[t].length, (a, o, n, l, s) => t(a, e[o].getUniformLocation(e[n], d.decode(r().subarray(l, l + s)))), (e, t) => WebAssembly.validate(r().subarray(e, e + t)), (t, a, r, o) => {
                    e[t].texParameteri(a >>> 0, r >>> 0, o)
                }
                , (t, a, r, o, n, l, s, d, i, c) => u(t, e[a](r >>> 0, e[o], n, l, s, d, i >>> 0, c >>> 0)), (t, a, o, n) => {
                    e[t].shaderSource(e[a], d.decode(r().subarray(o, o + n)))
                }
                , (t, a, r) => {
                    e[t].bindTexture(a >>> 0, e[r])
                }
                , (a, r, o) => t(a, e[r].createShader(o >>> 0)), t => {
                    e[t].lineCap = "round"
                }
                , t => {
                    e[t].fill()
                }
                , t => {
                    e[t].lineJoin = "round"
                }
                , (a, r) => t(a, e[r]()), () => window.devicePixelRatio, (t, a, o, n, l) => {
                    e[t].strokeText(d.decode(r().subarray(a, a + o)), n, l)
                }
                , () => !!window.RTCDataChannel, t => e[t].shift() || 0, (t, a) => e[t][a].featured, (e, t) => {
                    try {
                        localStorage.setItem("arras.io", d.decode(r().subarray(e, e + t)))
                    } catch (e) {}
                }
                , () => crypto.getRandomValues(new Uint32Array(1))[0], (t, a, o) => {
                    e[t].value = d.decode(r().subarray(a, a + o))
                }
                , (t, a) => {
                    e[t].clear(a >>> 0)
                }
                , e => t(e, document.createElement("canvas")), t => "number" == typeof e[t], (a, r, o) => t(a, e[r].getContext("2d", {
                    alpha: o > 0
                })), (a, o, n, l, s, i) => t(a, e[o](d.decode(r().subarray(n, n + l)), d.decode(r().subarray(s, s + i)))), (t, a, r) => {
                    e[t].lineTo(a, r)
                }
                , (t, a, r) => c(t, e[a](e[r])), (t, a, r, o, n) => {
                    e[t].blendFuncSeparate(a >>> 0, r >>> 0, o >>> 0, n >>> 0)
                }
                , (t, a, o, n, l) => e[t](d.decode(r().subarray(a, a + o)), e[n], l >>> 0), (t, a, r, o) => e[t](e[a], r, o), (t, a, r, o, n) => {
                    e[t].viewport(a, r, o, n)
                }
                , t => {
                    e[t].style.clipPath = "none"
                }
                , (t, a) => u(t, e[a]), (t, a, o) => {
                    e[t].style.cursor = d.decode(r().subarray(a, a + o))
                }
                , (a, o, n, l, s, i, c) => t(a, e[o](d.decode(r().subarray(n, n + l)), d.decode(r().subarray(s, s + i)), e[c])), (t, a) => {
                    e[t].globalAlpha = a
                }
                , (t, a) => {
                    e[t].disable(a >>> 0)
                }
                , e => t(e, document.createElement("div")), (a, r) => t(a, e[r](f)), (t, a, o) => e[t].measureText(d.decode(r().subarray(a, a + o))).width, (t, a, r) => {
                    t = e[t],
                    a >>>= 0,
                    t.strokeStyle = `rgba(${a >> 16},${a >> 8 & 255},${255 & a},${r})`
                }
                , (t, a, r, o, n, l) => {
                    e[t].arc(a, r, o, n, l)
                }
                , t => 0 === (t = e[t]).length ? 0 : t[0].status ? 1 : t[0].signature ? 2 : 3, (t, a, o) => e[t](d.decode(r().subarray(a, a + o))), t => {
                    e[t].close()
                }
                , (t, a) => e[t](e[a]), () => navigator.hardwareConcurrency || -1, (a, r) => (r = e[r],
                t(a, new Promise(e => r.toBlob(e)))), (t, a, o, n) => e[t](d.decode(r().subarray(a, a + o)), e[n], f), (a, r, o) => t(a, e[r](e[o], f)), (t, a) => {
                    e[t].font = `${a}px Trebuchet MS`
                }
                , t => {
                    e[t].focus()
                }
                , (t, a) => {
                    e[t].replaceWith(e[a])
                }
                , (t, a, r, o, n) => {
                    e[t].scissor(a, r, o, n)
                }
                , (t, a, o, n, l) => {
                    e[t].fillText(d.decode(r().subarray(a, a + o)), n, l)
                }
                , (t, a) => {
                    e[t].font = `${a}px Ubuntu`
                }
                , (t, a, r, o) => {
                    e[t].uniform2f(e[a], r, o)
                }
                , t => e[t](), t => e[t][0].timestamp, (a, r) => t(a, e[r].createTexture()), (t, a, r, o, n) => {
                    e[t].rect(a, r, o, n)
                }
                , (t, a, r) => ( (e, t) => {
                    let a = h.c(t.length << 3, 8);
                    ((null == l || 0 === l.byteLength) && (l = new Float64Array(h.g.buffer)),
                    l).set(t, a >> 3),
                    n().set([a, t.length], e >> 2)
                }
                )(t, e[a](e[r])), (t, a) => c(t, e[a].lastValue), t => e[t].shift(), (t, a, r, o, n, l, s) => {
                    e[t].texImage2D(a >>> 0, r, o >>> 0, n >>> 0, l >>> 0, e[s])
                }
                , (t, a) => c(t, e[a]), (t, a, o, n) => c(t, e[a](d.decode(r().subarray(o, o + n)))), () => !!window.WebTransport, t => {
                    window.addEventListener("beforeunload", e[t])
                }
                , (t, a) => e[t][a].online, t => "string" == typeof e[t], (t, a) => {
                    e[t].useProgram(e[a])
                }
                , () => window.innerWidth, (t, a, r, o, n, l, s) => {
                    e[t].vertexAttribPointer(a >>> 0, r, o >>> 0, n > 0, l, s)
                }
                , (t, a, o) => {
                    e[t].lastValue = d.decode(r().subarray(a, a + o))
                }
                , t => e[t].readyState, (t, a) => u(t, e[a].shift()), t => {
                    e[t] = null
                }
                , () => window.innerHeight, (e, t) => {
                    location.hash = d.decode(r().subarray(e, e + t))
                }
                , t => e[t].isContextLost(), (t, a, r, o, n) => {
                    e[t].drawElements(a >>> 0, r, o >>> 0, n)
                }
                , (t, a, r) => {
                    e[t].uniform1i(e[a], r)
                }
                , (a, o, n, l, s) => t(a, e[o](e[n], d.decode(r().subarray(l, l + s)))), t => {
                    window.removeEventListener("beforeunload", e[t])
                }
                , (t, a, r, o, n) => {
                    e[t].style.clipPath = `xywh(${a}px ${r}px ${o}px ${n}px)`
                }
                , (t, a) => e[t][a].hidden, (t, a, r) => {
                    e[t].translate(a, r)
                }
                , (t, a) => e[t][a].maxClients || 0, (a, r) => t(a, e[r].createProgram()), () => new Date(new Date().getFullYear(),0,1).getTimezoneOffset(), (t, a) => {
                    e[t].compileShader(e[a])
                }
                , t => "boolean" == typeof e[t], (a, o, n, l) => t(a, e[o](d.decode(r().subarray(n, n + l)))), (t, a) => c(t, e[a].shift().signature), (t, a) => e[t][a].uptime, e => t(e, []), t => !e[t], (t, a, r) => {
                    e[t].pixelStorei(a >>> 0, r)
                }
                , (t, a, r, o, n, l) => {
                    try {
                        e[t].drawImage(e[a], r, o, n, l)
                    } catch (e) {}
                }
                , t => {
                    e[t].remove()
                }
                , (t, a) => {
                    e[t].lineWidth = a
                }
                , () => !!navigator.serviceWorker, t => {
                    (t = e[t]).addEventListener("focus", () => t.select())
                }
                , t => {
                    e[t].closePath()
                }
                , t => e[t].shift().clients, (e, t, a, o) => {
                    console.log(d.decode(r().subarray(e, e + t)), d.decode(r().subarray(a, a + o)))
                }
                , (t, a, o, n, l) => e[t](r().subarray(a, a + o), d.decode(r().subarray(n, n + l))), (t, a, o) => {
                    t = e[t],
                    a = r().subarray(a, a + o),
                    1 === t.readyState && t.send(a)
                }
                , (t, a) => c(t, e[a].protocol), (a, r) => t(a, e[r].createBuffer()), (t, a, r) => {
                    e[t].bindBuffer(a >>> 0, e[r])
                }
                , (t, a) => {
                    t = e[t],
                    a = e[a],
                    t.then(e => a(e))
                }
                , e => c(e, location.hostname), (t, a, r, o, n) => {
                    e[t].uniform3f(e[a], r, o, n)
                }
                , t => {
                    e[t].style.textAlign = "center"
                }
                , (a, r, o, n) => t(a, e[r](e[o], n > 0)), (t, a, r) => {
                    e[t].blendFunc(a >>> 0, r >>> 0)
                }
                , (t, a, r, o, n, l, s) => e[t](e[a], r, o, n, l, s), t => e[t].complete, (a, r) => t(a, e[r][1]), (t, a, o, n, l) => {
                    e[t].bufferData(a >>> 0, r().subarray(o, o + n), l >>> 0)
                }
                , e => c(e, navigator.userAgent || ""), () => null != document.fullscreenElement, (t, a) => ( (e, t) => {
                    null != t && c(e, t)
                }
                )(t, e[a].pop()), (t, a) => {
                    e[t].depthFunc(a >>> 0)
                }
                , t => {
                    e[t].stroke()
                }
                , () => window.arrasAdDone, t => {
                    e[t].restore()
                }
                , (t, a) => {
                    e[t].font = `bold ${a}px Ubuntu`
                }
                , (t, a, r) => c(t, e[a][r].name), () => performance.now(), (t, a, r) => {
                    e[t].moveTo(a, r)
                }
                , () => parent !== top, (t, a, r) => {
                    t = e[t],
                    a >>>= 0,
                    t.fillStyle = `rgba(${a >> 16},${a >> 8 & 255},${255 & a},${r})`
                }
                , (t, a) => e[t][a].clients, (t, a) => {
                    e[t].enableVertexAttribArray(a >>> 0)
                }
                , t => {
                    e[t].save()
                }
                , () => {
                    try {
                        location.reload()
                    } catch (e) {}
                }
                , (t, a) => {
                    e[t].linkProgram(e[a])
                }
                , (t, a) => {
                    e[t].appendChild(e[a])
                }
                , (t, a, r, o) => {
                    try {
                        e[t].drawImage(e[a], r, o)
                    } catch (e) {}
                }
                , t => document.activeElement === e[t], (e, t) => !!WebAssembly[d.decode(r().subarray(e, e + t))], (t, a) => c(t, "127.0.0"), (t, a, r, o, n) => {
                    e[t].strokeRect(a, r, o, n)
                }
                , (t, a) => {
                    e[t].activeTexture(a >>> 0)
                }
                , (t, a) => {
                    t = e[t],
                    a >>>= 0,
                    t.strokeStyle = `rgb(${a >> 16},${a >> 8 & 255},${255 & a})`
                }
                , (t, a, r) => c(t, e[a][r].code), e => t(e, window), (e, t) => {
                    open(d.decode(r().subarray(e, e + t)), "_blank", "noopener")
                }
                , (t, a) => e[t][a].mspt, e => c(e, document.referrer), () => !!window.RTCPeerConnection, t => {
                    e[t].clip()
                }
                , (t, a, r, o) => {
                    e[t].drawArrays(a >>> 0, r, o)
                }
                , () => "boolean" == typeof window.crossOriginIsolated, (a, r, o) => t(a, e[r].getParameter(o >>> 0)), (t, a, r, o, n, l, s, d, i, c, u, b) => e[t](e[a], r, o, n, l, s, d >>> 0, i, c, u > 0, b > 0), (a, r, o) => t(a, e[r](e[o])), (t, a, o, n) => {
                    e[t](new Blob([e[a]],{
                        type: d.decode(r().subarray(o, o + n))
                    }))
                }
                , (e, t) => {
                    location.hash = `#${d.decode(r().subarray(e, e + t))}`
                }
                , (t, a, r) => {
                    e[t].attachShader(e[a], e[r])
                }
                , () => !!navigator.gpu, (t, a, o, n, l) => {
                    e[t](new Blob([r().subarray(a, a + o)],{
                        type: d.decode(r().subarray(n, n + l))
                    }))
                }
                , () => Date.now(), e => c(e, location.hash), t => {
                    e[t][1] = !0
                }
                , (t, a) => c(t, e[a].shift()), t => 0 === (t = e[t]).length ? -1 : t.shift(), (t, a) => {
                    e[t].enable(a >>> 0)
                }
                , (t, a) => c(t, e[a].value), () => "boolean" == typeof window.credentialless]]
                  , y = fetch("./app.wasm")
                  , h = (await (WebAssembly.instantiateStreaming ? WebAssembly.instantiateStreaming(y, b) : WebAssembly.instantiate(await (await y).arrayBuffer(), b))).instance.exports
                  , f = h.f;
                h.b()
            }
            )()
