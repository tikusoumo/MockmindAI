import re

file_path = r'q:\Coding\ai_voice_agent\Monorepo\apps\platform\app\interview\page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

def replacer(match):
    return '''                candidates.push({
                    id: p.id,
                    name: p.name || p.email?.split('@')[0] || "Unknown",
                    role: p.role,
                    avatar: https://i.pravatar.cc/150?u=,
                    isLocal: false,
                    camOn: remoteParticipants.some((lkp: any) => (lkp.name === (p.name || p.email?.split('@')[0] || "Unknown") || lkp.identity.includes(p.name || p.email?.split('@')[0] || "Unknown")) && lkp.isCameraEnabled),
                    micOn: remoteParticipants.some((lkp: any) => (lkp.name === (p.name || p.email?.split('@')[0] || "Unknown") || lkp.identity.includes(p.name || p.email?.split('@')[0] || "Unknown")) && lkp.isMicrophoneEnabled),
                    speaking: remoteParticipants.some((lkp: any) => (lkp.name === (p.name || p.email?.split('@')[0] || "Unknown") || lkp.identity.includes(p.name || p.email?.split('@')[0] || "Unknown")) && lkp.isSpeaking)
                });'''

text = re.sub(r'candidates\.push\(\{[\s\S]*?id: p\.id,[\s\S]*?name: p\.name \|\| p\.email\?\.split\(\'@\'\)\[0\] \|\| "Unknown",[\s\S]*?role: p\.role,[\s\S]*?avatar: https://i\.pravatar\.cc/150\?u=\$\{p\.email\},[\s\S]*?isLocal: false,[\s\S]*?camOn: true,[\s\S]*?micOn: false[\s\S]*?\}\);', replacer, text)

# Add unregistered LiveKit participants logic right after it inside the if-else
def add_new_participants(match):
    added = '''
        // Add any active LiveKit participants not mapped from DB yet (e.g., link-only guests)
        remoteParticipants.forEach((lkp: any) => {
            if (lkp.identity.startsWith('agent-')) return;
            if (!candidates.find((c: any) => c.name === lkp.name) && !interviewers.find((i: any) => i.name === lkp.name)) {
                candidates.push({
                    id: lkp.identity,
                    name: lkp.name || lkp.identity,
                    role: "Candidate",
                    avatar: https://i.pravatar.cc/150?u=,
                    isLocal: false,
                    camOn: lkp.isCameraEnabled,
                    micOn: lkp.isMicrophoneEnabled,
                    speaking: lkp.isSpeaking
                });
            }
        });
    } else {'''
    return match.group(1) + added

text = re.sub(r'(        \}\);\r?\n    \} else {)', add_new_participants, text)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)
