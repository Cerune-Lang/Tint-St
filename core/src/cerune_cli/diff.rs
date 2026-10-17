use std::fmt::Write as _;

pub fn diff_lines(left: &str, right: &str, left_label: &str, right_label: &str) -> String {
    let mut output = String::new();

    if left == right {
        let _ = writeln!(output, "No differences: {left_label} == {right_label}",);

        return output;
    }

    let _ = writeln!(output, "--- {left_label}",);

    let _ = writeln!(output, "+++ {right_label}",);

    let left_lines: Vec<&str> = left.lines().collect();

    let right_lines: Vec<&str> = right.lines().collect();

    let n = left_lines.len();

    let m = right_lines.len();

    // 大きな入力ではLCS表を作らず、共通の接頭辞と接尾辞だけを畳みます。
    if n.saturating_mul(m) > 4_000_000 {
        write_prefix_suffix_diff(&mut output, &left_lines, &right_lines);

        return output;
    }

    let mut table = vec![vec![0u32; m + 1]; n + 1];

    for i in (0..n).rev() {
        for j in (0..m).rev() {
            table[i][j] = if left_lines[i] == right_lines[j] {
                table[i + 1][j + 1] + 1
            } else {
                table[i + 1][j].max(table[i][j + 1])
            };
        }
    }

    let (mut i, mut j) = (0usize, 0usize);

    while i < n && j < m {
        if left_lines[i] == right_lines[j] {
            let _ = writeln!(output, "  {}", left_lines[i]);

            i += 1;

            j += 1;
        } else if table[i + 1][j] >= table[i][j + 1] {
            let _ = writeln!(output, "- {}", left_lines[i]);

            i += 1;
        } else {
            let _ = writeln!(output, "+ {}", right_lines[j]);

            j += 1;
        }
    }

    while i < n {
        let _ = writeln!(output, "- {}", left_lines[i]);

        i += 1;
    }

    while j < m {
        let _ = writeln!(output, "+ {}", right_lines[j]);

        j += 1;
    }

    output
}

fn write_prefix_suffix_diff(output: &mut String, left_lines: &[&str], right_lines: &[&str]) {
    let n = left_lines.len();

    let m = right_lines.len();

    let mut prefix = 0;

    while prefix < n && prefix < m && left_lines[prefix] == right_lines[prefix] {
        prefix += 1;
    }

    let mut suffix = 0;

    while suffix < n - prefix && suffix < m - prefix
        && left_lines[n - 1 - suffix] == right_lines[m - 1 - suffix]
    {
        suffix += 1;
    }

    for line in &left_lines[..prefix] {
        let _ = writeln!(output, "  {line}");
    }

    for line in &left_lines[prefix..n - suffix] {
        let _ = writeln!(output, "- {line}");
    }

    for line in &right_lines[prefix..m - suffix] {
        let _ = writeln!(output, "+ {line}");
    }

    for line in &left_lines[n - suffix..] {
        let _ = writeln!(output, "  {line}");
    }
}

#[cfg(test)]
mod tests {
    use super::diff_lines;

    #[test]
    fn identical_inputs_report_no_differences() {
        let result = diff_lines("a\nb\n", "a\nb\n", "left", "right");

        assert_eq!(result, "No differences: left == right\n");
    }

    #[test]
    fn changed_line_is_shown_as_delete_and_insert() {
        let result = diff_lines("a\nb\nc\n", "a\nx\nc\n", "left", "right");

        assert!(result.contains("- b\n"), "{result}");

        assert!(result.contains("+ x\n"), "{result}");

        assert!(result.contains("  a\n"), "{result}");

        assert!(result.contains("  c\n"), "{result}");
    }

    #[test]
    fn added_line_is_shown_as_insert() {
        let result = diff_lines("a\nc\n", "a\nb\nc\n", "left", "right");

        assert!(result.contains("  a\n"), "{result}");

        assert!(result.contains("+ b\n"), "{result}");

        assert!(result.contains("  c\n"), "{result}");

        assert!(!result.lines().any(|line| line.starts_with("- ")), "{result}");
    }

    #[test]
    fn prefix_and_suffix_are_preserved_for_large_inputs() {
        let left = format!("{}\n{}\n{}", "head".repeat(10), "old".repeat(10), "tail".repeat(10));

        let right = format!("{}\n{}\n{}", "head".repeat(10), "new".repeat(10), "tail".repeat(10));

        let result = diff_lines(&left, &right, "left", "right");

        assert!(result.contains(&format!("- {}", "old".repeat(10))), "{result}");

        assert!(result.contains(&format!("+ {}", "new".repeat(10))), "{result}");
    }
}
