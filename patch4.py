import re

file_path = r'q:\Coding\ai_voice_agent\Monorepo\apps\platform\app\interview\page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if 'micOn: false' in line and skip:
        new_lines.append(line.replace('micOn: false', 'micOn: matchingLkParticipant ? matchingLkParticipant.isMicrophoneEnabled : false,\n                  speaking: matchingLkParticipant ? matchingLkParticipant.isSpeaking : false'))
        continue

    if 'camOn: true,' in line and skip:
        new_lines.append(line.replace('camOn: true,', 'camOn: matchingLkParticipant ? matchingLkParticipant.isCameraEnabled : false,'))
        continue
        
    if 'name: p.name' in line and skip:
        new_lines.append(line.replace('name: p.name || p.email?.split(\'@\')[0] || "Unknown",', 'name: pName,'))
        continue

    if "if (roleNormalized === 'candidate'" in line:
        skip = True
        new_lines.append('            const pName = p.name || p.email?.split(\'@\')[0] || "Unknown";\n')
        new_lines.append('            const matchingLkParticipant = remoteParticipants.find((lkp: any) => lkp.name === pName || lkp.identity.includes(pName));\n')
        new_lines.append(line)
        continue
    
    if skip and '});' in line:
        new_lines.append(line)
        skip = False
        continue

    if '} else {' in line and not skip and 'Dynamic rendering' not in lines[i+1] and 'allParticipants =' not in line:
        # Add LiveKit Unregistered
        new_lines.append('''        remoteParticipants.forEach((lkp: any) => {
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
''')

    new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print("Done")
