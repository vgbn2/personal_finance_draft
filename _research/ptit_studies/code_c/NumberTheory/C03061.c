/*
 * Filename: C03061.c
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
    int l = strlen(s);
    if (2 * (s[0] - '0') != (s[l - 1] - '0') && (s[0] - '0') != 2 * (s[l - 1] - '0'))
        return 0;
    for (int i = 1; i < l / 2; i++)
        if (s[i] != s[l - 1 - i])
            return 0;
    return 1;
}

// Function to solve specific test case
void solve()
{
    char s[20];
    scanf("%s", s); // Read input
    if (check(s))
        printf("YES\n"); // Print result
    else
        printf("NO\n"); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}