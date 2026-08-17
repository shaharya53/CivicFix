from typing import Dict, List, Set
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # active connections: user_id -> list of WebSockets
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # role subscriptions: role_name -> set of WebSockets
        self.role_connections: Dict[str, Set[WebSocket]] = {
            "CITIZEN": set(),
            "WORKER": set(),
            "ADMIN": set(),
            "SUPER_ADMIN": set()
        }

    async def connect(self, websocket: WebSocket, user_id: int, role: str):
        await websocket.accept()
        
        # Add to active connections
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        
        # Add to role subscriptions
        role_upper = role.upper()
        if role_upper in self.role_connections:
            self.role_connections[role_upper].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int, role: str):
        # Remove from active connections
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                
        # Remove from role connections
        role_upper = role.upper()
        if role_upper in self.role_connections:
            self.role_connections[role_upper].discard(websocket)

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    async def broadcast_to_role(self, message: dict, role: str):
        role_upper = role.upper()
        if role_upper in self.role_connections:
            for connection in list(self.role_connections[role_upper]):
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    async def broadcast_all(self, message: dict):
        for connections in self.active_connections.values():
            for connection in connections:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()
