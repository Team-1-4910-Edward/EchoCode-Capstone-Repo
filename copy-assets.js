const fs = require('fs');
const path = require('path');

// List of all non-JS files your extension needs at runtime
const filesToCopy = [
  'Core/program_settings/JSON_files/Annotation_Settings.json',
  'Core/program_settings/program_settings/external_commands.json',
  'Core/program_settings/program_settings/voice_commands.json',
  'Core/program_settings/program_settings/local_intent_matcher.py',
  'program_features/Voice/local_whisper_stt.py'
];

filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(__dirname, 'dist', file);
  
  if (fs.existsSync(src)) {
    // Create the necessary folders inside dist/
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // Copy the file
    fs.copyFileSync(src, dest);
    console.log(`✅ Copied: ${file}`);
  } else {
    console.warn(`⚠️ Warning: Could not find ${src}`);
  }
});