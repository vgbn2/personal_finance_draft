/*
 * Filename: C06032.c
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

bool check(char a[15], char b[15])
{
    char s1[30], s2[30];
    strcpy(s1, a);
    strcat(s1, b);
    strcpy(s2, b);
    strcat(s2, a);
    if (strcmp(s1, s2) >= 0)
        return 1;
    return 0;
}

// Function to solve specific test case
void solve()
{
    int m;
    scanf("%d\n", &m); // Read input
    char a[10][15];
    for (int i = 1; i <= m; i++)
        scanf("%s", a[i]); // Read input
    for (int i = 1; i < m; i++)
        for (int j = i + 1; j <= m; j++)
            if (check(a[i], a[j]))
            {
                char tg[15];
                strcpy(tg, a[i]);
                strcpy(a[i], a[j]);
                strcpy(a[j], tg);
            }
    for (int i = 1; i <= m; i++)
        printf("%s", a[i]); // Print result
    printf("\n"); // Print result
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