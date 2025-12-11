#!/usr/bin/env python3
"""
WebMumble Backend - Python WebSocket bridge to Mumble servers
"""

import asyncio
import json
import base64
import ssl
import socket
import logging
from typing import Optional, Dict, Any, Tuple
import threading
import time as time_module
import websockets
import pymumble_py3 as pymumble
import pymumble_py3.mumble
from pymumble_py3.constants import PYMUMBLE_CLBK_SOUNDRECEIVED, PYMUMBLE_CLBK_TEXTMESSAGERECEIVED, PYMUMBLE_CLBK_USERCREATED, PYMUMBLE_CLBK_USERUPDATED, PYMUMBLE_CLBK_USERREMOVED, PYMUMBLE_CLBK_CHANNELCREATED, PYMUMBLE_CLBK_CHANNELUPDATED, PYMUMBLE_CLBK_CHANNELREMOVED, PYMUMBLE_CLBK_CONNECTED, PYMUMBLE_CLBK_DISCONNECTED

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def patch_pymumble_ssl():
    """Monkey-patch pymumble to accept self-signed certificates with modern SSL"""
    import pymumble_py3.mumble as mumble_module
    from pymumble_py3.constants import (
        PYMUMBLE_CONN_STATE_FAILED,
        PYMUMBLE_CONN_STATE_AUTHENTICATING,
        PYMUMBLE_MSG_TYPES_VERSION,
        PYMUMBLE_MSG_TYPES_AUTHENTICATE,
        PYMUMBLE_PROTOCOL_VERSION,
        PYMUMBLE_OS_STRING,
        PYMUMBLE_OS_VERSION_STRING,
    )
    from pymumble_py3 import mumble_pb2

    def patched_connect(self):
        """Patched connect method using modern SSL that accepts self-signed certs"""
        try:
            # Get IPv4/IPv6 server address
            server_info = socket.getaddrinfo(self.host, self.port, type=socket.SOCK_STREAM)
            self.Log.debug("connecting to %s (%s) on port %i.", self.host, server_info[0][1], self.port)

            std_sock = socket.socket(server_info[0][0], socket.SOCK_STREAM)
            std_sock.settimeout(10)
        except socket.error:
            self.connected = PYMUMBLE_CONN_STATE_FAILED
            return self.connected

        try:
            # Create SSL context that accepts self-signed certs
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE

            # Load client cert if provided
            if self.certfile:
                context.load_cert_chain(self.certfile, self.keyfile)

            self.control_socket = context.wrap_socket(std_sock, server_hostname=self.host)
            self.control_socket.connect((self.host, self.port))
            self.control_socket.setblocking(False)

            # Perform the Mumble authentication
            version = mumble_pb2.Version()
            version.version = (PYMUMBLE_PROTOCOL_VERSION[0] << 16) + (PYMUMBLE_PROTOCOL_VERSION[1] << 8) + PYMUMBLE_PROTOCOL_VERSION[2]
            version.release = self.application
            version.os = PYMUMBLE_OS_STRING
            version.os_version = PYMUMBLE_OS_VERSION_STRING
            self.Log.debug("sending: version: %s", version)
            self.send_message(PYMUMBLE_MSG_TYPES_VERSION, version)

            authenticate = mumble_pb2.Authenticate()
            authenticate.username = self.user
            authenticate.password = self.password
            authenticate.tokens.extend(self.tokens)
            authenticate.opus = True
            self.Log.debug("sending: authenticate: %s", authenticate)
            self.send_message(PYMUMBLE_MSG_TYPES_AUTHENTICATE, authenticate)

        except socket.error:
            self.connected = PYMUMBLE_CONN_STATE_FAILED
            return self.connected

        self.connected = PYMUMBLE_CONN_STATE_AUTHENTICATING
        return self.connected

    # Replace the connect method
    mumble_module.Mumble.connect = patched_connect


# Apply the patch
patch_pymumble_ssl()

class MumbleClient:
    """Manages a Mumble connection for a WebSocket client"""

    def __init__(self, ws):
        self.ws = ws
        self.mumble: Optional[pymumble.Mumble] = None
        self.connected = False
        self.loop = asyncio.get_event_loop()
        # Audio buffering per user to reduce packet overhead
        self.audio_buffers: Dict[int, bytearray] = {}
        self.audio_flush_task: Optional[asyncio.Task] = None
        self.AUDIO_BUFFER_MS = 60  # Buffer 60ms of audio before sending

    async def send(self, msg_type: str, payload: Any):
        """Send a message to the WebSocket client"""
        try:
            await self.ws.send(json.dumps({"type": msg_type, "payload": payload}))
        except Exception as e:
            logger.error(f"Error sending to websocket: {e}")

    def send_sync(self, msg_type: str, payload: Any):
        """Send a message from sync context (callbacks)"""
        asyncio.run_coroutine_threadsafe(self.send(msg_type, payload), self.loop)

    def connect(self, address: str, port: int, username: str, insecure: bool = True):
        """Connect to a Mumble server"""
        logger.info(f"Connecting to {address}:{port} as {username}")

        self.mumble = pymumble.Mumble(address, username, port=port, reconnect=False)

        # Set up callbacks
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_CONNECTED, self._on_connected)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_DISCONNECTED, self._on_disconnected)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_SOUNDRECEIVED, self._on_sound_received)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_TEXTMESSAGERECEIVED, self._on_text_message)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_USERCREATED, self._on_user_change)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_USERUPDATED, self._on_user_change)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_USERREMOVED, self._on_user_change)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_CHANNELCREATED, self._on_channel_change)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_CHANNELUPDATED, self._on_channel_change)
        self.mumble.callbacks.set_callback(PYMUMBLE_CLBK_CHANNELREMOVED, self._on_channel_change)

        # Enable audio receive
        self.mumble.set_receive_sound(True)

        # Start connection (non-blocking)
        self.mumble.start()
        self.mumble.is_ready()  # Wait for connection

        self.connected = True
        logger.info("Connected to Mumble server")

    def _on_connected(self):
        """Called when connected to Mumble server"""
        self.connected = True  # Set connected here so _sync_tree works
        self.send_sync("connected", {"status": "ok"})
        self.send_sync("log", {"text": "Connected to Mumble server", "level": "server"})
        self._sync_tree()

    def _on_disconnected(self):
        """Called when disconnected from Mumble server"""
        self.connected = False
        self.send_sync("log", {"text": "Disconnected from server", "level": "server"})

    def _on_sound_received(self, user, sound_chunk):
        """Called when audio is received from a user"""
        if not sound_chunk or not sound_chunk.pcm:
            return

        session = user["session"]

        # Buffer audio data
        if session not in self.audio_buffers:
            self.audio_buffers[session] = {
                'data': bytearray(),
                'name': user["name"],
                'last_send': time_module.time()
            }

        buffer = self.audio_buffers[session]
        buffer['data'].extend(sound_chunk.pcm)

        # Send when we have enough data (60ms worth = 5760 bytes at 48kHz 16-bit mono)
        # Or if it's been more than 40ms since last send
        bytes_per_ms = 48000 * 2 / 1000  # 96 bytes per ms
        target_bytes = int(self.AUDIO_BUFFER_MS * bytes_per_ms)
        time_since_send = time_module.time() - buffer['last_send']

        if len(buffer['data']) >= target_bytes or (len(buffer['data']) > 0 and time_since_send > 0.04):
            pcm_data = base64.b64encode(bytes(buffer['data'])).decode('utf-8')
            self.send_sync("audio", {
                "userId": str(session),
                "userName": buffer['name'],
                "data": pcm_data,
                "sampleRate": 48000
            })
            buffer['data'] = bytearray()
            buffer['last_send'] = time_module.time()

    def _on_text_message(self, message):
        """Called when a text message is received"""
        actor = message.actor
        sender = "Server"
        sender_id = "0"
        if actor and self.mumble:
            user = self.mumble.users.get(actor)
            if user:
                sender = user["name"]
                sender_id = str(actor)

        # Check if this is a video message
        msg_content = message.message
        try:
            if msg_content.startswith('{') and '_wm_video' in msg_content:
                parsed = json.loads(msg_content)
                if parsed.get('_wm_video'):
                    msg_type = parsed.get('type', 'unknown')
                    frame_info = f" frame={parsed.get('frameId')} frag={parsed.get('fragmentIndex')}/{parsed.get('fragmentCount')}" if msg_type == 'video_frame' else ""
                    logger.info(f"[Video] Received {msg_type}{frame_info} from {sender}")
                    # Forward video message with type 'video'
                    self.send_sync("video", {
                        "sender": sender,
                        "senderId": sender_id,
                        "data": parsed
                    })
                    return  # Don't process as regular chat
        except (json.JSONDecodeError, KeyError) as e:
            logger.debug(f"Failed to parse potential video message: {e}")
            pass  # Not a video message, process normally

        # Regular chat message
        self.send_sync("chat", {
            "sender": sender,
            "message": msg_content
        })

    def _on_user_change(self, *args):
        """Called when user state changes"""
        self._sync_tree()

    def _on_channel_change(self, *args):
        """Called when channel state changes"""
        self._sync_tree()

    def _sync_tree(self):
        """Send the full channel/user tree to the frontend"""
        if not self.mumble or not self.connected:
            return

        try:
            tree = self._build_channel_tree(0)
            self.send_sync("sync_tree", tree)
        except Exception as e:
            logger.error(f"Error syncing tree: {e}")

    def _build_channel_tree(self, channel_id: int) -> Dict[str, Any]:
        """Recursively build the channel tree"""
        channel = self.mumble.channels.get(channel_id)
        if not channel:
            return {
                "id": "0",
                "name": "Root",
                "users": [],
                "children": [],
                "isExpanded": True
            }

        # Get users in this channel
        users = []
        my_session = self.mumble.users.myself["session"] if self.mumble.users.myself else None

        for user in self.mumble.users.values():
            if user["channel_id"] == channel_id:
                users.append({
                    "id": str(user["session"]),
                    "name": user["name"],
                    "isMuted": user.get("mute", False) or user.get("self_mute", False),
                    "isDeafened": user.get("deaf", False) or user.get("self_deaf", False),
                    "isTalking": False,
                    "isSelf": user["session"] == my_session,
                    "channelId": str(channel_id)
                })

        # Get child channels
        children = []
        for ch in self.mumble.channels.values():
            if ch.get("parent") == channel_id and ch["channel_id"] != channel_id:
                children.append(self._build_channel_tree(ch["channel_id"]))

        return {
            "id": str(channel_id),
            "name": channel["name"],
            "description": channel.get("description", ""),
            "users": users,
            "children": children,
            "isExpanded": True,
            "parentId": str(channel.get("parent", "")) if channel.get("parent") is not None else ""
        }

    def join_channel(self, channel_id: int):
        """Move self to a channel"""
        if not self.mumble or not self.connected:
            return

        channel = self.mumble.channels.get(channel_id)
        if channel:
            channel.move_in()
            logger.info(f"Moved to channel {channel['name']}")

    def send_audio(self, pcm_data: bytes):
        """Send audio to Mumble"""
        if not self.mumble or not self.connected:
            return

        try:
            self.mumble.sound_output.add_sound(pcm_data)
        except Exception as e:
            logger.error(f"Error sending audio: {e}")

    def send_chat(self, text: str, channel_id: Optional[int] = None):
        """Send a text message to a channel"""
        if not self.mumble or not self.connected:
            logger.warning("Cannot send chat: not connected")
            return

        # Check message length - Mumble has typical limits around 5KB
        msg_len = len(text.encode('utf-8'))
        if msg_len > 5000:
            logger.warning(f"Message too long ({msg_len} bytes), may fail")
            self.send_sync("log", {"text": f"Warning: Message too long ({msg_len} bytes), may fail", "level": "error"})

        try:
            if channel_id is not None:
                channel = self.mumble.channels.get(channel_id)
                if channel:
                    channel.send_text_message(text)
                else:
                    logger.warning(f"Channel {channel_id} not found")
            else:
                # Send to current channel
                my_channel = self.mumble.users.myself["channel_id"]
                channel = self.mumble.channels.get(my_channel)
                if channel:
                    channel.send_text_message(text)
                else:
                    logger.warning(f"Current channel {my_channel} not found")
        except Exception as e:
            logger.error(f"Error sending chat: {e}", exc_info=True)
            self.send_sync("log", {"text": f"Failed to send message: {e}", "level": "error"})

    def send_direct_message(self, text: str, user_session_id: int):
        """Send a direct/private message to a specific user"""
        if not self.mumble or not self.connected:
            logger.warning("Cannot send direct message: not connected")
            return False

        try:
            msg_len = len(text.encode('utf-8'))
            if msg_len > 5000:
                logger.warning(f"Direct message too long ({msg_len} bytes), may fail")

            user = self.mumble.users.get(user_session_id)
            if user:
                user.send_text_message(text)
                return True
            else:
                logger.warning(f"User session {user_session_id} not found for direct message")
                return False
        except Exception as e:
            logger.error(f"Error sending direct message: {e}")
            return False

    def send_to_multiple_users(self, text: str, user_session_ids: list):
        """Send a message to multiple specific users"""
        if not self.mumble or not self.connected:
            return

        for session_id in user_session_ids:
            self.send_direct_message(text, session_id)

    def disconnect(self):
        """Disconnect from Mumble server"""
        if self.mumble:
            self.mumble.stop()
            self.mumble = None
            self.connected = False


async def handle_client(websocket):
    """Handle a WebSocket client connection"""
    logger.info("WebSocket client connected")
    client = MumbleClient(websocket)

    try:
        async for message in websocket:
            try:
                msg = json.loads(message)
                msg_type = msg.get("type")
                payload = msg.get("payload", {})

                if msg_type == "connect":
                    address = payload.get("address", "localhost")
                    port = int(payload.get("port", 64738))
                    username = payload.get("username", "WebMumbleUser")
                    insecure = payload.get("insecure", True)

                    try:
                        client.connect(address, port, username, insecure)
                    except Exception as e:
                        logger.error(f"Connection failed: {e}")
                        await client.send("error", {"message": str(e)})

                elif msg_type == "chat":
                    text = payload.get("text", "")
                    channel_id = payload.get("channelId")
                    if channel_id is not None and channel_id != "":
                        channel_id = int(channel_id)
                    else:
                        channel_id = None
                    logger.info(f"Sending chat to channel {channel_id}: {text[:100]}...")
                    client.send_chat(text, channel_id)

                elif msg_type == "join_channel":
                    channel_id = int(payload.get("channelId", 0))
                    client.join_channel(channel_id)

                elif msg_type == "audio":
                    # Receive audio from browser
                    pcm_b64 = payload.get("data", "")
                    if pcm_b64:
                        pcm_data = base64.b64decode(pcm_b64)
                        client.send_audio(pcm_data)

                elif msg_type == "disconnect":
                    client.disconnect()

                elif msg_type == "video_channel":
                    # Send video announcement to channel (start/stop streaming)
                    video_data = payload.get("data", {})
                    video_json = json.dumps(video_data)
                    channel_id = payload.get("channelId")
                    if channel_id is not None and channel_id != "":
                        channel_id = int(channel_id)
                    else:
                        channel_id = None
                    client.send_chat(video_json, channel_id)

                elif msg_type == "video_direct":
                    # Send video frame/message to specific user(s)
                    video_data = payload.get("data", {})
                    video_json = json.dumps(video_data)
                    target_ids = payload.get("targetIds", [])
                    vmsg_type = video_data.get('type', 'unknown')
                    if vmsg_type == 'video_frame':
                        logger.debug(f"[Video] Sending frame {video_data.get('frameId')} frag {video_data.get('fragmentIndex')}/{video_data.get('fragmentCount')} to {len(target_ids)} users")
                    else:
                        logger.info(f"[Video] Sending {vmsg_type} to {target_ids}")
                    for target_id in target_ids:
                        try:
                            success = client.send_direct_message(video_json, int(target_id))
                            if not success:
                                # Notify frontend that this subscriber is gone
                                await client.send("subscriber_gone", {"userId": str(target_id)})
                        except (ValueError, TypeError) as e:
                            logger.error(f"[Video] Error sending to {target_id}: {e}")

            except json.JSONDecodeError:
                logger.error("Invalid JSON received")
            except Exception as e:
                logger.error(f"Error handling message: {e}")

    except websockets.exceptions.ConnectionClosed:
        logger.info("WebSocket client disconnected")
    finally:
        client.disconnect()


async def main():
    """Main entry point"""
    port = 9847
    logger.info(f"WebMumble backend starting on port {port}")
    logger.info(f"WebSocket endpoint: ws://localhost:{port}/ws")

    async with websockets.serve(handle_client, "0.0.0.0", port):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    asyncio.run(main())
