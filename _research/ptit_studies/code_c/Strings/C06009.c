/*
 * Filename: C06009.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <string.h>
#include <stdbool.h>

bool check(char s[])
{
    if (s[1] == s[2] && s[2] == s[3] && s[4] == s[5])
        return 1;
    if (s[1] < s[2] && s[2] < s[3] && s[3] < s[4] && s[4] < s[5])
        return 1;
    for (int i = 1; i <= 5; i++)
        if (s[i] != '6' && s[i] != '8')
            return 0;
}

// Function to solve specific test case
void solve()
{
    char s[15];
    gets(s);
    char str[10] = {'#', s[6], s[7], s[8], s[10], s[11]};
    if (check(str))
        printf("YES\n"); // Print result
    else
        printf("NO\n"); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d\n", &t); // Read input
    while (t--)
        solve();
    return 0;
}