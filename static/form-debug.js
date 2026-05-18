// Debug script to analyze form fields - paste into browser console
(function() {
    const fields = [];

    document.querySelectorAll('input[type=text],input:not([type]),textarea,select').forEach((el, idx) => {
        const label = (() => {
            let labelText = '';
            document.querySelectorAll('label').forEach(l => {
                if (l.htmlFor === el.id || l.contains(el)) {
                    labelText = l.textContent.trim();
                }
            });
            return labelText || el.parentElement?.textContent?.trim()?.substring(0, 50) || '';
        })();

        fields.push({
            index: idx,
            type: el.tagName,
            inputType: el.type || 'text',
            name: el.name || '',
            id: el.id || '',
            placeholder: el.placeholder || '',
            label: label,
            value: el.value || '',
            options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({text: o.textContent.trim(), value: o.value})) : []
        });
    });

    console.log('=== FORM FIELDS ===');
    console.table(fields);
    console.log(JSON.stringify(fields, null, 2));
})();
