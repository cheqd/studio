import * as fs from 'fs';
import * as path from 'path';

// Find the most recent studio-migrations file
function findLatestStudioMigration(): string | null {
    const migrationsDir = 'src/database/migrations';
    const files = fs.readdirSync(migrationsDir)
        .filter(file => file.includes('studio-migrations.ts'))
        .map(file => ({
            name: file,
            path: path.join(migrationsDir, file),
            mtime: fs.statSync(path.join(migrationsDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    return files.length > 0 ? files[0].name : null;
}

// Extract class name from filename (e.g., ${timestamp}-studio-migrations.ts -> StudioMigrations${timestamp})
function getClassNameFromFilename(filename: string): string {
    const timestamp = filename.split('-')[0];
    return `StudioMigrations${timestamp}`;
}

// Add migration to types.ts
function addMigrationToTypes(filename: string, className: string): void {
    const typesPath = 'src/database/types/types.ts';
    let content = fs.readFileSync(typesPath, 'utf8');
    
    // Check if already imported
    if (content.includes(className)) {
        console.log(`⚠️  Migration ${className} already exists in TypeORM DataSource declaration.`);
        return;
    }
    
    // Add import
    const importStatement = `import { ${className} } from '../migrations/${filename.replace('.ts', '.js')}';`;
    const lastImportIndex = content.lastIndexOf('import');
    const insertIndex = content.indexOf('\n', lastImportIndex) + 1;
    content = content.slice(0, insertIndex) + importStatement + '\n' + content.slice(insertIndex);
    
    // Find the migrations array in Postgres class and add the new migration
    const lines = content.split('\n');
    const postgresStartIndex = lines.findIndex(line => line.includes('export class Postgres'));
    const migrationsStartIndex = lines.findIndex((line, index) => 
        index > postgresStartIndex && line.includes('migrations: [')
    );
    
    if (migrationsStartIndex === -1) {
        console.log('❌ Could not find migrations array in Postgres class');
        return;
    }
    
    // Find the closing bracket of migrations array
    let bracketCount = 0;
    let migrationsEndIndex = -1;
    
    for (let i = migrationsStartIndex; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('[')) bracketCount++;
        if (line.includes(']')) bracketCount--;
        if (bracketCount === 0) {
            migrationsEndIndex = i;
            break;
        }
    }
    
    if (migrationsEndIndex === -1) {
        console.log('❌ Could not find the end of migrations array');
        return;
    }
    
    // Insert the new migration before the closing bracket
    lines.splice(migrationsEndIndex, 0, `\t\t\t\t${className},`);
    
    // Write back to file
    fs.writeFileSync(typesPath, lines.join('\n'));
    
    console.log(`✅ Added migration ${className} TypeORM DataSource declaration`);
    console.log(`📁 Script: ${filename}`);
    console.log(`⚙️ Config: ${typesPath}`);
}

// Main execution
function main(): void {
    console.log('🔍 Looking for the latest studio migration...');
    
    const latestMigration = findLatestStudioMigration();
    
    if (!latestMigration) {
        console.log('❌ No new studio migration files found');
        return;
    }
    
    console.log(`📄 Found migration: ${latestMigration}`);
    
    const className = getClassNameFromFilename(latestMigration);
    console.log(`🏷️  Class name: ${className}`);
    
    addMigrationToTypes(latestMigration, className);
}

main(); 