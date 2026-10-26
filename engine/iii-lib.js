/**
 * iii-lib.js
 * The parts of iii's lib.lua that the emulator doesn't implement in JS, run in every
 * Lua state before the script. Copied unchanged from the firmware:
 *   neotrellis-monome/neotrellis_monome_picosdk_iii/src/iii/lua/lib.lua (ed920ef)
 *
 * Included: iii_version, midi_out / midi_tx_many / msg_to_midi_tx / midi_to_msg,
 * the utils (ps, pt, round, wrap, linlin, clamp, _quote) and slew.
 * Left out, because lua-loader.js provides them: the midi_note_on/off/cc shortcuts
 * (the JS ones also play the internal synth), metro, pset, and the REPL helpers
 * (first, ls, rm, cat, mem, gc).
 *
 * slew.init() at the end takes one metro, as on the device, so scripts get 11 of the 12.
 */

export const III_LIB = String.raw`
iii_version="v1.1.2"

-- MIDI
midi_out = function(msg)
  if msg and msg.type then
    msg_to_midi_tx[msg.type](msg)
  else
    midi_tx_many(msg)
  end
end

midi_tx_many = function(d)
  if #d > 0 then
    for i=0, ((#d - 1)// 3) do
      midi_tx(d[3 * i + 1], d[3 * i + 2], d[3 * i + 3])
    end
  end
end

msg_to_midi_tx = {
  note_on = function(msg) midi_tx(0x90 + (msg.ch or 1)-1, msg.note, msg.vel or 100) end,
  note_off = function(msg) midi_tx(0x80 + (msg.ch or 1)-1, msg.note, msg.vel or 100) end,
  cc = function(msg) midi_tx(0xb0 + (msg.ch or 1) - 1, msg.cc, msg.val) end,
  pitchbend = function(msg) midi_tx(0xe0 + (msg.ch or 1) - 1, msg.val & 0x7f, (msg.val >> 7) & 0x7f) end,
  key_pressure = function(msg) midi_tx(0xa0 + (msg.ch or 1) - 1, msg.note, msg.val) end,
  channel_pressure = function(msg) midi_tx(0xd0 + (msg.ch or 1) - 1, msg.val) end,
  program_change = function(msg) midi_tx(0xc0 + (msg.ch or 1) - 1, msg.val) end,
  start = function(msg) midi_tx(0xfa) end,
  stop = function(msg) midi_tx(0xfc) end,
  continue = function(msg) midi_tx(0xfb) end,
  clock = function(msg) midi_tx(0xf8) end,
  song_position = function(msg) midi_tx(0xf2, msg.lsb, msg.msb) end,
  song_select = function(msg) midi_tx(0xf3, msg.val) end,
  sysex = function(msg) midi_tx_many(msg.raw) end,
  other = function(msg) midi_tx_many(msg.raw) end
}

function midi_to_msg(data)
  local msg = {}
  -- note on
  if data[1] & 0xf0 == 0x90 then
    msg = { note = data[2], vel = data[3], ch = data[1] - 0x90 + 1 }
    if data[3] > 0 then msg.type = "note_on"
    elseif data[3] == 0 then -- if velocity is zero then send note off
      msg.type = "note_off"
    end
    -- note off
  elseif data[1] & 0xf0 == 0x80 then
    msg = { type = "note_off", note = data[2], vel = data[3], ch = data[1] - 0x80 + 1 }
    -- cc
  elseif data[1] & 0xf0 == 0xb0 then
    msg = { type = "cc", cc = data[2], val = data[3], ch = data[1] - 0xb0 + 1 }
    -- pitchbend
  elseif data[1] & 0xf0 == 0xe0 then
    msg = { type = "pitchbend", val = data[2] + (data[3] << 7), ch = data[1] - 0xe0 + 1 }
    -- key pressure
  elseif data[1] & 0xf0 == 0xa0 then
    msg = { type = "key_pressure", note = data[2], val = data[3], ch = data[1] - 0xa0 + 1 }
    -- channel pressure
  elseif data[1] & 0xf0 == 0xd0 then
    msg = { type = "channel_pressure", val = data[2], ch = data[1] - 0xd0 + 1 }
    -- program change
  elseif data[1] & 0xf0 == 0xc0 then
    msg = { type = "program_change", val = data[2], ch = data[1] - 0xc0 + 1 }
    -- start
  elseif data[1] == 0xfa then
    msg.type = "start"
    -- stop
  elseif data[1] == 0xfc then
    msg.type = "stop"
    -- continue
  elseif data[1] == 0xfb then
    msg.type = "continue"
    -- clock
  elseif data[1] == 0xf8 then
    msg.type = "clock"
    -- song position pointer
  elseif data[1] == 0xf2 then
    msg = { type = "song_position", lsb = data[2], msb = data[3] }
    -- song select
  elseif data[1] == 0xf3 then
    msg = { type = "song_select", val = data[2] }
    -- active sensing (should probably ignore)
  elseif data[1] == 0xfe then
    -- do nothing
    -- system exclusive
  elseif data[1] == 0xf0 then
    msg = { type = "sysex", raw = data, }
    -- everything else
  else
    msg = { type = "other", raw = data, }
  end
  return msg
end

-- utils

ps = function(...) print(string.format(...)) end
pt = function(t) for k,v in pairs(t) do print(k .. '\t' .. tostring(v)) end end

function round(number, quant)
  if quant == 0 then return number
  else return math.floor(number/(quant or 1) + 0.5) * (quant or 1) end
end

function wrap(n, min, max)
  if max < min then
    local temp = min
    min = max
    max = temp
  end
  if n >= min and n <= max then
    return n
  end
  local d = max - min + 1
  local y = (n - min) % d
  return y + min
end

function linlin(n, slo, shi, dlo, dhi)
  if n <= slo then return dlo
  elseif n >= shi then return dhi
  else return (n-slo) / (shi-slo) * (dhi-dlo) + dlo
  end
end

function clamp(n, min, max)
  return math.min(max,(math.max(n,min)))
end

function _quote(val, ...)
  -- stringify any data so lua can load() it
  if ... ~= nil then
    local t = {_quote(val)} -- capture 1st arg
    for _,v in ipairs{...} do -- capture varargs
      table.insert(t, _quote(v))
    end
    return table.concat(t, ',')
  elseif type(val) == 'string' then return string.format('%q',val)
  elseif type(val) == 'number' then return string.format('%.6g',val):gsub("%.?0+$","") -- 6 sig figures
  elseif type(val) ~= 'table' then return tostring(val)
  else -- recur per table element
    local t = {}
    for k,v in pairs(val) do
      -- FIXME: float indices not handled right, so we can strip trailing zero
      local fstr = (type(k)=='number') and '[%d]' or '[%q]'
      local f = string.format(fstr, k)
      table.insert(t, f .. '=' .. _quote(v))
    end
    return string.format('{%s}', table.concat(t, ','))
  end
end

-- SLEW
slew = {}
slew.n = 1 -- upward counting id number
slew.s = {} -- data table
-- TODO: do we want autostop (stop slew on completion)
slew.new = function(cb, v_start, v_end, time, q)
  slew.s[slew.n] = { f=cb, s=v_start, e=v_end, t=(time or 0.1), q=(q or 1)}
  local v = slew.s[slew.n]
  v.t = math.floor(v.t*100)/100
  v.c = v.t * 100
  if v.c < 2 then
    v.n = v.e
    v.run = false
    --print("slew: one stage only")
  else
    v.d = (v.e - v.s) / v.c
    v.n = v.s
    v.l = v.n
    v.run = true
  end
  v.f(v.n)
  slew.n = slew.n + 1
  return slew.n - 1
end
slew.to = function(id, v_end, time)
  if slew.s[id] then
    local v = slew.s[id]
    if time then v.t = time end
    v.e = v_end
    v.c = v.t * 100
    if v.c < 2 then
      v.n = v.e
      v.run = false
      v.f(v.n)
      --print("slew: single")
    else
      v.s = v.n
      v.d = (v.e - v.s) / v.c
      v.l = v.n
      v.run = true
    end
  end
end
slew.freeze = function(id)
  if slew.s[id] then slew.s[id].run = false end
end
slew.stop = function(id)
  if slew.s[id] then slew.s[id] = nil end
end
slew.allfreeze = function()
  for k,_ in pairs(slew.s) do slew.s[k].run = false end
end
slew.allstop = function()
  for k,_ in pairs(slew.s) do slew.s[k] = nil end
end
slew.process = function()
  for k,v in pairs(slew.s) do
    if v.run then
      v.n = v.n + v.d
      local r = round(v.n,v.q)
      if r ~= v.l then
        v.l = r
        v.f(r)
      end
      v.c = v.c - 1
      if v.c < 1 then
        v.run = false
      end
    end
  end
end
slew.init = function()
  if not slew.id then
    slew.id = metro.init(slew.process,0.01)
    slew.id:start()
  end
end
slew.deinit = function()
  if slew.id then metro.free(slew.id) end
end
slew.init()
`;
