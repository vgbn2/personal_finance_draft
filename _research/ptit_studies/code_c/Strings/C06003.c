/*
 * Filename: C06003.c
 * Description: C Program
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

// Entry point
int main()
{
    int t;
    scanf("%d\n", &t); // Read input
    while (t--)
    {
        char s[201] = {};
        gets(s);
        int n = 0;
        char *token = strtok(s, " ");
        while (token != NULL)
        {
            n++;
            token = strtok(NULL, " ");
        }
        printf("%d\n", n); // Print result
    }
    return 0;
}