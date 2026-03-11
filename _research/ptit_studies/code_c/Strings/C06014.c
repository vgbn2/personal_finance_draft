/*
 * Filename: C06014.c
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

// Function to solve specific test case
void solve()
{
    char s[105];
    gets(s);
    char res[105][105];
    int n = 0;
    char *token = strtok(s, " ");
    while (token != NULL)
    {
        strcpy(res[n++], token);
        token = strtok(NULL, " ");
    }
    for (int i = 0; i < n; i++)
    {
        if (res[i][0] >= 'a' && res[i][0] <= 'z')
            res[i][0] -= 32;
        for (int j = 1; j < strlen(res[i]); j++)
            if (res[i][j] >= 'A' && res[i][j] <= 'Z')
                res[i][j] += 32;
        printf("%s ", res[i]); // Print result
    }
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